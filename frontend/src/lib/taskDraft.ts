import type { NewTask } from '../api/types';

/** Matches the backend's limit on nesting. */
export const MAX_DEPTH = 10;

export interface TaskDraft {
  key: string;
  title: string;
  skillIds: number[];
  subtasks: TaskDraft[];
}

let nextKey = 0;

export function newDraft(): TaskDraft {
  return { key: `draft-${nextKey++}`, title: '', skillIds: [], subtasks: [] };
}

/** Returns a copy of the tree with `change` applied to the node matching `key`. */
export function updateDraft(
  node: TaskDraft,
  key: string,
  change: (node: TaskDraft) => TaskDraft,
): TaskDraft {
  if (node.key === key) return change(node);
  return { ...node, subtasks: node.subtasks.map((child) => updateDraft(child, key, change)) };
}

export function addSubtask(root: TaskDraft, parentKey: string): TaskDraft {
  return updateDraft(root, parentKey, (node) => ({
    ...node,
    subtasks: [...node.subtasks, newDraft()],
  }));
}

export function removeDraft(node: TaskDraft, key: string): TaskDraft {
  return {
    ...node,
    subtasks: node.subtasks
      .filter((child) => child.key !== key)
      .map((child) => removeDraft(child, key)),
  };
}

export function findBlankTitles(node: TaskDraft): Set<string> {
  const blank = new Set<string>();
  const visit = (current: TaskDraft) => {
    if (current.title.trim() === '') blank.add(current.key);
    current.subtasks.forEach(visit);
  };
  visit(node);
  return blank;
}

export function toNewTask(draft: TaskDraft): NewTask {
  return {
    title: draft.title.trim(),
    skillIds: draft.skillIds,
    subtasks: draft.subtasks.map(toNewTask),
  };
}
