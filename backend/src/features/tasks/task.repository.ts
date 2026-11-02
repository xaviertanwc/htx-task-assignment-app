import { withTransaction, type Pool, type Queryable } from '../../db/database.js';
import type { TaskStatus } from './task.schemas.js';

export type SkillsSource = 'user' | 'llm' | 'pending';

export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
  parentTaskId: number | null;
  assignee: { id: number; name: string } | null;
  skills: { id: number; name: string }[];
  skillsSource: SkillsSource;
  createdAt: string;
  updatedAt: string;
  subtasks: Task[];
}

export interface NewTask {
  title: string;
  parentTaskId: number | null;
  skillIds: number[];
  skillsSource: SkillsSource;
}

export interface LockedTask {
  status: TaskStatus;
  assigneeId: number | null;
  skillsSource: SkillsSource;
  parentStatus: TaskStatus | null;
  skills: { id: number; name: string }[];
}

/** Operations that must share one database transaction. */
export interface TaskTransaction {
  insert(task: NewTask): Promise<number>;
  /** Locks the task and its parent. See the implementation for why the order matters. */
  lock(id: number): Promise<LockedTask | undefined>;
  findUnfinishedSubtasks(parentId: number): Promise<{ id: number; title: string }[]>;
  update(id: number, fields: { status?: TaskStatus; assigneeId?: number | null }): Promise<void>;
}

export interface TaskRepository {
  /** Top-level tasks, newest first, each with its full subtree. */
  findAll(): Promise<Task[]>;
  findTree(id: number): Promise<Task | undefined>;
  transaction<T>(work: (tx: TaskTransaction) => Promise<T>): Promise<T>;
  findPendingSkills(limit: number): Promise<{ id: number; title: string }[]>;
  /** Records identified skills. Returns false if the task was no longer pending. */
  resolvePendingSkills(id: number, skillIds: number[]): Promise<boolean>;
}

interface TaskRow {
  id: number;
  title: string;
  status: TaskStatus;
  parent_task_id: number | null;
  assignee_id: number | null;
  assignee_name: string | null;
  skills: { id: number; name: string }[];
  skills_source: SkillsSource;
  created_at: Date;
  updated_at: Date;
}

const SKILLS_OF_TASK = `
  COALESCE((
    SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.id)
    FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
    WHERE ts.task_id = t.id
  ), '[]')
`;

const TASK_COLUMNS = `
  t.id, t.title, t.status, t.parent_task_id, t.skills_source, t.created_at, t.updated_at,
  d.id AS assignee_id,
  d.name AS assignee_name,
  ${SKILLS_OF_TASK} AS skills
`;

/** Links rows into trees. Rows whose parent is absent from `rows` become roots. */
function buildForest(rows: TaskRow[]): Task[] {
  const byId = new Map<number, Task>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        status: row.status,
        parentTaskId: row.parent_task_id,
        assignee:
          row.assignee_id === null ? null : { id: row.assignee_id, name: row.assignee_name! },
        skills: row.skills,
        skillsSource: row.skills_source,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        subtasks: [],
      },
    ]),
  );
  const roots: Task[] = [];
  for (const task of byId.values()) {
    const parent = task.parentTaskId === null ? undefined : byId.get(task.parentTaskId);
    if (parent) parent.subtasks.push(task);
    else roots.push(task);
  }
  return roots;
}

function createTaskTransaction(db: Queryable): TaskTransaction {
  return {
    async insert(task) {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO tasks (title, parent_task_id, skills_source) VALUES ($1, $2, $3) RETURNING id`,
        [task.title, task.parentTaskId, task.skillsSource],
      );
      const id = rows[0]!.id;
      await db.query(`INSERT INTO task_skills (task_id, skill_id) SELECT $1, unnest($2::int[])`, [
        id,
        task.skillIds,
      ]);
      return id;
    },

    async lock(id) {
      // parent_task_id never changes, so it is safe to read it before taking any lock.
      const { rows: found } = await db.query<{ parent_task_id: number | null }>(
        'SELECT parent_task_id FROM tasks WHERE id = $1',
        [id],
      );
      if (!found[0]) return undefined;

      // Always lock parent before child. A task moving to Done holds its own row exclusively, so a
      // subtask being reopened at the same moment must either finish first or see the parent as Done.
      const parentId = found[0].parent_task_id;
      let parentStatus: TaskStatus | null = null;
      if (parentId !== null) {
        const { rows } = await db.query<{ status: TaskStatus }>(
          'SELECT status FROM tasks WHERE id = $1 FOR SHARE',
          [parentId],
        );
        parentStatus = rows[0]!.status;
      }
      const { rows } = await db.query<{
        status: TaskStatus;
        assignee_id: number | null;
        skills_source: SkillsSource;
        skills: LockedTask['skills'];
      }>(
        `SELECT t.status, t.assignee_id, t.skills_source, ${SKILLS_OF_TASK} AS skills
         FROM tasks t WHERE t.id = $1 FOR UPDATE OF t`,
        [id],
      );
      const { status, assignee_id: assigneeId, skills_source: skillsSource, skills } = rows[0]!;
      return { status, assigneeId, skillsSource, skills, parentStatus };
    },

    async findUnfinishedSubtasks(parentId) {
      const { rows } = await db.query<{ id: number; title: string }>(
        `SELECT id, title FROM tasks WHERE parent_task_id = $1 AND status <> 'Done' ORDER BY id`,
        [parentId],
      );
      return rows;
    },

    async update(id, fields) {
      await db.query(
        `
        UPDATE tasks SET
          status = COALESCE($2, status),
          assignee_id = CASE WHEN $3 THEN $4::int ELSE assignee_id END,
          updated_at = now()
        WHERE id = $1
        `,
        [id, fields.status ?? null, fields.assigneeId !== undefined, fields.assigneeId ?? null],
      );
    },
  };
}

export function createTaskRepository(pool: Pool): TaskRepository {
  return {
    async findAll() {
      const { rows } = await pool.query<TaskRow>(`
        SELECT ${TASK_COLUMNS}
        FROM tasks t LEFT JOIN developers d ON d.id = t.assignee_id
        ORDER BY t.id
      `);
      return buildForest(rows).reverse();
    },

    async findTree(id) {
      const { rows } = await pool.query<TaskRow>(
        `
        WITH RECURSIVE tree AS (
          SELECT id FROM tasks WHERE id = $1
          UNION ALL
          SELECT child.id FROM tasks child JOIN tree ON child.parent_task_id = tree.id
        )
        SELECT ${TASK_COLUMNS}
        FROM tasks t
        JOIN tree ON tree.id = t.id
        LEFT JOIN developers d ON d.id = t.assignee_id
        ORDER BY t.id
        `,
        [id],
      );
      return buildForest(rows)[0];
    },

    transaction: (work) => withTransaction(pool, (client) => work(createTaskTransaction(client))),

    async findPendingSkills(limit) {
      const { rows } = await pool.query<{ id: number; title: string }>(
        `SELECT id, title FROM tasks WHERE skills_source = 'pending' ORDER BY id LIMIT $1`,
        [limit],
      );
      return rows;
    },

    resolvePendingSkills: (id, skillIds) =>
      withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
          `UPDATE tasks SET skills_source = 'llm', updated_at = now()
           WHERE id = $1 AND skills_source = 'pending'`,
          [id],
        );
        if (rowCount === 0) return false;
        await client.query(
          `INSERT INTO task_skills (task_id, skill_id) SELECT $1, unnest($2::int[])`,
          [id, skillIds],
        );
        return true;
      }),
  };
}
