import { withTransaction, type Db, type Queryable } from '../db/pool.js';
import { AppError, notFound } from '../errors.js';
import { SkillIdentificationError, type SkillIdentifier } from '../llm/skillIdentifier.js';
import { listSkills, type Skill } from './skills.js';
import {
  developerExists,
  findAllTasks,
  findMissingSkills,
  findTaskTree,
  findUnfinishedSubtasks,
  insertTask,
  lockTaskWithParent,
  updateTaskFields,
  type Task,
} from './taskRepository.js';
import type { TaskInput, TaskUpdate } from './taskSchemas.js';

export interface TaskService {
  list(): Promise<Task[]>;
  get(id: number): Promise<Task>;
  create(input: TaskInput): Promise<Task>;
  update(id: number, update: TaskUpdate): Promise<Task>;
}

function flatten(node: TaskInput): TaskInput[] {
  return [node, ...node.subtasks.flatMap(flatten)];
}

export function createTaskService(db: Db, skillIdentifier: SkillIdentifier): TaskService {
  /** Resolves LLM skills for every node that has none, keyed by node. One call for the whole tree. */
  async function identifyMissingSkills(
    nodes: TaskInput[],
    catalogue: Skill[],
  ): Promise<Map<TaskInput, number[]>> {
    const unspecified = nodes.filter((node) => node.skillIds.length === 0);
    if (unspecified.length === 0) return new Map();

    let answers: string[][];
    try {
      answers = await skillIdentifier.identify(
        unspecified.map((node) => node.title),
        catalogue.map((skill) => skill.name),
      );
    } catch (error) {
      if (!(error instanceof SkillIdentificationError)) throw error;
      throw new AppError(
        503,
        'SKILL_IDENTIFICATION_FAILED',
        'Skills could not be identified automatically right now. Nothing was saved. Try again, or select the skills yourself.',
      );
    }

    const idByName = new Map(catalogue.map((skill) => [skill.name, skill.id]));
    return new Map(
      unspecified.map((node, index) => [
        node,
        answers[index]!.map((name) => idByName.get(name)!),
      ]),
    );
  }

  async function insertTree(
    client: Queryable,
    node: TaskInput,
    parentTaskId: number | null,
    identified: Map<TaskInput, number[]>,
  ): Promise<number> {
    const llmSkillIds = identified.get(node);
    const id = await insertTask(client, {
      title: node.title,
      parentTaskId,
      skillIds: llmSkillIds ?? [...new Set(node.skillIds)],
      skillsSource: llmSkillIds ? 'llm' : 'user',
    });
    for (const subtask of node.subtasks) {
      await insertTree(client, subtask, id, identified);
    }
    return id;
  }

  async function applyStatusRules(
    client: Queryable,
    id: number,
    current: { status: Task['status']; parentStatus: Task['status'] | null },
    next: Task['status'],
  ): Promise<void> {
    if (next === 'Done') {
      const unfinished = await findUnfinishedSubtasks(client, id);
      if (unfinished.length > 0) {
        throw new AppError(
          409,
          'SUBTASKS_NOT_DONE',
          'A task can only be marked Done once all its subtasks are Done.',
          { unfinishedSubtasks: unfinished },
        );
      }
    } else if (current.parentStatus === 'Done') {
      // Reopening under a Done parent would leave a Done task with an unfinished subtask.
      throw new AppError(
        409,
        'PARENT_TASK_DONE',
        'This subtask belongs to a Done task. Move the parent task out of Done first.',
      );
    }
  }

  async function applyAssigneeRules(
    client: Queryable,
    taskId: number,
    developerId: number,
  ): Promise<void> {
    if (!(await developerExists(client, developerId))) {
      throw new AppError(422, 'DEVELOPER_NOT_FOUND', `Developer ${developerId} was not found.`);
    }
    const missing = await findMissingSkills(client, taskId, developerId);
    if (missing.length > 0) {
      throw new AppError(
        422,
        'DEVELOPER_MISSING_SKILLS',
        `This developer lacks skills required by the task: ${missing.join(', ')}.`,
        { missingSkills: missing },
      );
    }
  }

  return {
    list: () => findAllTasks(db),

    async get(id) {
      const task = await findTaskTree(db, id);
      if (!task) throw notFound('Task', id);
      return task;
    },

    async create(input) {
      const nodes = flatten(input);
      const catalogue = await listSkills(db);

      const knownIds = new Set(catalogue.map((skill) => skill.id));
      const unknown = [...new Set(nodes.flatMap((node) => node.skillIds))].filter(
        (id) => !knownIds.has(id),
      );
      if (unknown.length > 0) {
        throw new AppError(422, 'UNKNOWN_SKILLS', `Unknown skill ids: ${unknown.join(', ')}.`, {
          unknownSkillIds: unknown,
        });
      }

      // The LLM call happens before the transaction so no connection is held during network I/O.
      const identified = await identifyMissingSkills(nodes, catalogue);
      const id = await withTransaction(db, (client) => insertTree(client, input, null, identified));
      return (await findTaskTree(db, id))!;
    },

    async update(id, update) {
      await withTransaction(db, async (client) => {
        const current = await lockTaskWithParent(client, id);
        if (!current) throw notFound('Task', id);

        if (update.status !== undefined) {
          await applyStatusRules(client, id, current, update.status);
        }
        if (update.assigneeId !== undefined && update.assigneeId !== null) {
          await applyAssigneeRules(client, id, update.assigneeId);
        }
        await updateTaskFields(client, id, update);
      });
      return (await findTaskTree(db, id))!;
    },
  };
}
