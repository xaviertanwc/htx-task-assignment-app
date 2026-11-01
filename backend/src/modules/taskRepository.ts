import type { Queryable } from '../db/database.js';
import type { TaskStatus } from './taskSchemas.js';

export type SkillsSource = 'user' | 'llm';

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

const TASK_COLUMNS = `
  t.id, t.title, t.status, t.parent_task_id, t.skills_source, t.created_at, t.updated_at,
  d.id AS assignee_id,
  d.name AS assignee_name,
  COALESCE((
    SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.id)
    FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
    WHERE ts.task_id = t.id
  ), '[]') AS skills
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

/** Top-level tasks, newest first, each with its full subtree. */
export async function findAllTasks(db: Queryable): Promise<Task[]> {
  const { rows } = await db.query<TaskRow>(`
    SELECT ${TASK_COLUMNS}
    FROM tasks t LEFT JOIN developers d ON d.id = t.assignee_id
    ORDER BY t.id
  `);
  return buildForest(rows).reverse();
}

export async function findTaskTree(db: Queryable, id: number): Promise<Task | undefined> {
  const { rows } = await db.query<TaskRow>(
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
}

export interface NewTask {
  title: string;
  parentTaskId: number | null;
  skillIds: number[];
  skillsSource: SkillsSource;
}

export async function insertTask(db: Queryable, task: NewTask): Promise<number> {
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
}

export async function lockTaskWithParent(
  db: Queryable,
  id: number,
): Promise<{ status: TaskStatus; parentStatus: TaskStatus | null } | undefined> {
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
  const { rows } = await db.query<{ status: TaskStatus }>(
    'SELECT status FROM tasks WHERE id = $1 FOR UPDATE',
    [id],
  );
  return { status: rows[0]!.status, parentStatus };
}

export async function findUnfinishedSubtasks(
  db: Queryable,
  parentId: number,
): Promise<{ id: number; title: string }[]> {
  const { rows } = await db.query<{ id: number; title: string }>(
    `SELECT id, title FROM tasks WHERE parent_task_id = $1 AND status <> 'Done' ORDER BY id`,
    [parentId],
  );
  return rows;
}

export async function findMissingSkills(
  db: Queryable,
  taskId: number,
  developerId: number,
): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `
    SELECT s.name
    FROM task_skills ts
    JOIN skills s ON s.id = ts.skill_id
    WHERE ts.task_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM developer_skills ds
        WHERE ds.developer_id = $2 AND ds.skill_id = ts.skill_id
      )
    ORDER BY s.id
    `,
    [taskId, developerId],
  );
  return rows.map((row) => row.name);
}

export async function developerExists(db: Queryable, id: number): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM developers WHERE id = $1', [id]);
  return rowCount === 1;
}

export async function updateTaskFields(
  db: Queryable,
  id: number,
  fields: { status?: TaskStatus; assigneeId?: number | null },
): Promise<void> {
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
}
