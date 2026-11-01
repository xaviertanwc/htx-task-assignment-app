import type { Developer, Task, TaskStatus, TaskUpdate } from '../../../shared/api/types';

export interface TaskFilters {
  search: string;
  status: TaskStatus | '';
  skillId: number | null;
  /** A developer id, 'unassigned', or null for no filter. */
  assignee: number | 'unassigned' | null;
}

export type TaskSort = 'newest' | 'oldest' | 'title' | 'status';

export const NO_FILTERS: TaskFilters = { search: '', status: '', skillId: null, assignee: null };

export function isFiltering(filters: TaskFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.status !== '' ||
    filters.skillId !== null ||
    filters.assignee !== null
  );
}

function matches(task: Task, filters: TaskFilters): boolean {
  const search = filters.search.trim().toLowerCase();
  if (search && !task.title.toLowerCase().includes(search)) return false;
  if (filters.status && task.status !== filters.status) return false;
  if (filters.skillId !== null && !task.skills.some((skill) => skill.id === filters.skillId)) {
    return false;
  }
  if (filters.assignee === 'unassigned') return task.assignee === null;
  if (filters.assignee !== null) return task.assignee?.id === filters.assignee;
  return true;
}

export interface TaskVisibility {
  /** Tasks that meet the filters themselves. */
  matched: Set<number>;
  /** Matched tasks plus their ancestors, which stay on screen as context. */
  visible: Set<number>;
}

export function findVisibleTasks(tasks: Task[], filters: TaskFilters): TaskVisibility {
  const matched = new Set<number>();
  const visible = new Set<number>();
  const visit = (task: Task): boolean => {
    const selfMatches = matches(task, filters);
    if (selfMatches) matched.add(task.id);
    // Every child must be visited, so this can't short-circuit.
    const childMatches = task.subtasks.map(visit).some(Boolean);
    const show = selfMatches || childMatches;
    if (show) visible.add(task.id);
    return show;
  };
  tasks.forEach(visit);
  return { matched, visible };
}

const STATUS_ORDER: Record<TaskStatus, number> = { 'To-do': 0, 'In Progress': 1, Done: 2 };

const COMPARATORS: Record<TaskSort, (a: Task, b: Task) => number> = {
  newest: (a, b) => b.id - a.id,
  oldest: (a, b) => a.id - b.id,
  title: (a, b) => a.title.localeCompare(b.title),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.id - a.id,
};

/** Sorts top-level tasks only: subtasks keep the order they were written in. */
export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  return [...tasks].sort(COMPARATORS[sort]);
}

export function subtaskProgress(task: Task): { done: number; total: number } {
  return {
    done: task.subtasks.filter((subtask) => subtask.status === 'Done').length,
    total: task.subtasks.length,
  };
}

function flatten(task: Task): Task[] {
  return [task, ...task.subtasks.flatMap(flatten)];
}

export function hasPendingSkills(tasks: Task[]): boolean {
  return tasks.flatMap(flatten).some((task) => task.skillsSource === 'pending');
}

export function countBySkillsSource(root: Task, source: Task['skillsSource']): number {
  return flatten(root).filter((task) => task.skillsSource === source).length;
}

/** Returns the tree as it should look once `update` succeeds. */
export function applyUpdate(
  tasks: Task[],
  id: number,
  update: TaskUpdate,
  developers: Developer[],
): Task[] {
  return tasks.map((task) => {
    if (task.id !== id) {
      return { ...task, subtasks: applyUpdate(task.subtasks, id, update, developers) };
    }
    const next = { ...task, status: update.status ?? task.status };
    if (update.assigneeId === undefined) return next;
    const developer = developers.find((candidate) => candidate.id === update.assigneeId);
    return { ...next, assignee: developer ? { id: developer.id, name: developer.name } : null };
  });
}
