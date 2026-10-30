import type { Developer, Task } from '../api/types';

/** A developer qualifies only by having every skill the task requires. */
export function eligibleDevelopers(task: Task, developers: Developer[]): Developer[] {
  return developers.filter((developer) =>
    task.skills.every((required) => developer.skills.some((skill) => skill.id === required.id)),
  );
}

export function canMarkDone(task: Task): boolean {
  return task.subtasks.every((subtask) => subtask.status === 'Done');
}
