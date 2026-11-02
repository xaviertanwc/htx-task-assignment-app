import type { Developer, SkillSummary, Task, TaskStatus } from '../../../shared/api/types';

export const TASK_STATUSES: TaskStatus[] = ['To-do', 'In Progress', 'Done'];

export function missingSkills(required: SkillSummary[], developer: Developer): string[] {
  const held = new Set(developer.skills.map((skill) => skill.id));
  return required.filter((skill) => !held.has(skill.id)).map((skill) => skill.name);
}

export function canMarkDone(task: Task): boolean {
  return task.subtasks.every((subtask) => subtask.status === 'Done');
}

/** Mirrors the backend: work can't start without an owner. */
export function needsAssigneeToStart(task: Task): boolean {
  return task.status === 'To-do' && task.assignee === null;
}

export function isStatusAllowed(task: Task, status: TaskStatus): boolean {
  if (status !== 'To-do' && needsAssigneeToStart(task)) return false;
  return status !== 'Done' || canMarkDone(task);
}

export function skillsPending(task: Task): boolean {
  return task.skillsSource === 'pending';
}
