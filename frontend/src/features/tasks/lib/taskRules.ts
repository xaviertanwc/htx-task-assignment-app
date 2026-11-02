import type { Developer, SkillSummary, Task, TaskStatus } from '../../../shared/api/types';

export const TASK_STATUSES: TaskStatus[] = ['To-do', 'In Progress', 'Done'];

export function missingSkills(required: SkillSummary[], developer: Developer): string[] {
  const held = new Set(developer.skills.map((skill) => skill.id));
  return required.filter((skill) => !held.has(skill.id)).map((skill) => skill.name);
}

export function canMarkDone(task: Task): boolean {
  return task.subtasks.every((subtask) => subtask.status === 'Done');
}

const progressOf = (status: TaskStatus) => TASK_STATUSES.indexOf(status);

/** Mirrors the backend: without an assignee, a task can move backwards but not forwards. */
export function isBlockedByMissingAssignee(task: Task, status: TaskStatus): boolean {
  return task.assignee === null && progressOf(status) > progressOf(task.status);
}

/** True when the task has somewhere to move forward to, but no assignee to do it. */
export function needsAssigneeToMoveForward(task: Task): boolean {
  return task.assignee === null && task.status !== 'Done';
}

export function isStatusAllowed(task: Task, status: TaskStatus): boolean {
  if (isBlockedByMissingAssignee(task, status)) return false;
  return status !== 'Done' || canMarkDone(task);
}

/**
 * Unassigning work that has started is allowed, but loses who owns or completed it, so the user is
 * asked to confirm. Returns the explanation to show, or null when no confirmation is needed.
 */
export function unassignWarning(task: Task): string | null {
  if (task.assignee === null || task.status === 'To-do') return null;
  if (task.status === 'Done') {
    return `This task is Done. Unassigning ${task.assignee.name} removes the record of who completed it.`;
  }
  return `This task is ${task.status}. Unassigning ${task.assignee.name} leaves started work without an owner, and it can't move forward until someone is assigned.`;
}

export function skillsPending(task: Task): boolean {
  return task.skillsSource === 'pending';
}
