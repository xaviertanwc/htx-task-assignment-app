import { AppError, notFound } from '../../shared/errors.js';
import type { SkillIdentifier } from '../../llm/skillIdentifier.js';
import type { DeveloperRepository } from '../developers/developer.repository.js';
import type { Skill, SkillRepository } from '../skills/skill.repository.js';
import { resolveSkillIds, type WarningLogger } from './skill.resolution.js';
import type { Task, TaskRepository, TaskTransaction } from './task.repository.js';
import {
  assertCanLeaveDone,
  assertCanMarkDone,
  assertDeveloperQualified,
  assertSkillsKnown,
} from './task.rules.js';
import type { TaskInput, TaskUpdate } from './task.schemas.js';

export interface TaskService {
  list(): Promise<Task[]>;
  get(id: number): Promise<Task>;
  create(input: TaskInput): Promise<Task>;
  update(id: number, update: TaskUpdate): Promise<Task>;
}

export interface TaskServiceDependencies {
  tasks: TaskRepository;
  skills: SkillRepository;
  developers: DeveloperRepository;
  skillIdentifier: SkillIdentifier;
  logger: WarningLogger;
}

function flatten(node: TaskInput): TaskInput[] {
  return [node, ...node.subtasks.flatMap(flatten)];
}

function assertSkillsExist(nodes: TaskInput[], catalogue: Skill[]): void {
  const knownIds = new Set(catalogue.map((skill) => skill.id));
  const unknown = [...new Set(nodes.flatMap((node) => node.skillIds))].filter(
    (id) => !knownIds.has(id),
  );
  if (unknown.length > 0) {
    throw new AppError(
      'unprocessable',
      'UNKNOWN_SKILLS',
      `Unknown skill ids: ${unknown.join(', ')}.`,
      {
        unknownSkillIds: unknown,
      },
    );
  }
}

export function createTaskService({
  tasks,
  skills,
  developers,
  skillIdentifier,
  logger,
}: TaskServiceDependencies): TaskService {
  /** Resolves LLM skills for every node that has none, keyed by node. One call for the whole tree. */
  async function identifyMissingSkills(
    nodes: TaskInput[],
    catalogue: Skill[],
  ): Promise<Map<TaskInput, number[]>> {
    const unspecified = nodes.filter((node) => node.skillIds.length === 0);
    if (unspecified.length === 0) return new Map();

    const skillIds = await resolveSkillIds(
      skillIdentifier,
      unspecified.map((node) => node.title),
      catalogue,
      logger,
    );
    return new Map(unspecified.map((node, index) => [node, skillIds[index]!]));
  }

  async function insertTree(
    tx: TaskTransaction,
    node: TaskInput,
    parentTaskId: number | null,
    identified: Map<TaskInput, number[]>,
  ): Promise<number> {
    const llmSkillIds = identified.get(node);
    const id = await tx.insert({
      title: node.title,
      parentTaskId,
      skillIds: llmSkillIds ?? [...new Set(node.skillIds)],
      skillsSource: !llmSkillIds ? 'user' : llmSkillIds.length > 0 ? 'llm' : 'pending',
    });
    for (const subtask of node.subtasks) {
      await insertTree(tx, subtask, id, identified);
    }
    return id;
  }

  return {
    list: () => tasks.findAll(),

    async get(id) {
      const task = await tasks.findTree(id);
      if (!task) throw notFound('Task', id);
      return task;
    },

    async create(input) {
      const nodes = flatten(input);
      const catalogue = await skills.findAll();
      assertSkillsExist(nodes, catalogue);

      // The LLM call happens before the transaction so no connection is held during network I/O.
      const identified = await identifyMissingSkills(nodes, catalogue);
      const id = await tasks.transaction((tx) => insertTree(tx, input, null, identified));
      return (await tasks.findTree(id))!;
    },

    async update(id, update) {
      await tasks.transaction(async (tx) => {
        const current = await tx.lock(id);
        if (!current) throw notFound('Task', id);

        if (update.status === 'Done') {
          assertCanMarkDone(await tx.findUnfinishedSubtasks(id));
        } else if (update.status !== undefined) {
          assertCanLeaveDone(current.parentStatus);
        }
        if (update.assigneeId !== undefined && update.assigneeId !== null) {
          assertSkillsKnown(current.skillsSource);
          const developer = await developers.findById(update.assigneeId);
          if (!developer) {
            throw new AppError(
              'unprocessable',
              'DEVELOPER_NOT_FOUND',
              `Developer ${update.assigneeId} was not found.`,
            );
          }
          assertDeveloperQualified(current.skills, developer.skills);
        }
        await tx.update(id, update);
      });
      return (await tasks.findTree(id))!;
    },
  };
}
