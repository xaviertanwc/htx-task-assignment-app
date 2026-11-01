import { AppError } from '../../shared/errors.js';
import type { TaskStatus } from './task.schemas.js';

interface NamedSkill {
  id: number;
  name: string;
}

export function findMissingSkills(required: NamedSkill[], held: NamedSkill[]): string[] {
  const heldIds = new Set(held.map((skill) => skill.id));
  return required.filter((skill) => !heldIds.has(skill.id)).map((skill) => skill.name);
}

export function assertDeveloperQualified(required: NamedSkill[], held: NamedSkill[]): void {
  const missing = findMissingSkills(required, held);
  if (missing.length > 0) {
    throw new AppError(
      'unprocessable',
      'DEVELOPER_MISSING_SKILLS',
      `This developer lacks skills required by the task: ${missing.join(', ')}.`,
      { missingSkills: missing },
    );
  }
}

export function assertCanMarkDone(unfinishedSubtasks: { id: number; title: string }[]): void {
  if (unfinishedSubtasks.length > 0) {
    throw new AppError(
      'conflict',
      'SUBTASKS_NOT_DONE',
      'A task can only be marked Done once all its subtasks are Done.',
      { unfinishedSubtasks },
    );
  }
}

/** Reopening under a Done parent would leave a Done task with an unfinished subtask. */
export function assertCanLeaveDone(parentStatus: TaskStatus | null): void {
  if (parentStatus === 'Done') {
    throw new AppError(
      'conflict',
      'PARENT_TASK_DONE',
      'This subtask belongs to a Done task. Move the parent task out of Done first.',
    );
  }
}
