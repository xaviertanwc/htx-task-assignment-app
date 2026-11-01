import type { Developer, SkillSummary, Task, TaskStatus } from '../../../shared/api/types';

export const TASK_STATUSES: TaskStatus[] = ['To-do', 'In Progress', 'Done'];

export function missingSkills(required: SkillSummary[], developer: Developer): string[] {
  const held = new Set(developer.skills.map((skill) => skill.id));
  return required.filter((skill) => !held.has(skill.id)).map((skill) => skill.name);
}

export function canMarkDone(task: Task): boolean {
  return task.subtasks.every((subtask) => subtask.status === 'Done');
}

export function skillsPending(task: Task): boolean {
  return task.skillsSource === 'pending';
}
