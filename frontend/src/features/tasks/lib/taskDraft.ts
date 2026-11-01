import type { TaskInput } from '../../../shared/api/types';

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

export function appendSubtask(root: TaskDraft, parentKey: string, subtask: TaskDraft): TaskDraft {
  return updateDraft(root, parentKey, (node) => ({
    ...node,
    subtasks: [...node.subtasks, subtask],
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

/** Keys of nodes with blank titles, in the order they appear on the page. */
export function findBlankTitles(node: TaskDraft): string[] {
  return [
    ...(node.title.trim() === '' ? [node.key] : []),
    ...node.subtasks.flatMap(findBlankTitles),
  ];
}

export function isPristine(draft: TaskDraft): boolean {
  return draft.title === '' && draft.skillIds.length === 0 && draft.subtasks.length === 0;
}

export function countDescendants(draft: TaskDraft): number {
  return draft.subtasks.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

export function toTaskInput(draft: TaskDraft): TaskInput {
  return {
    title: draft.title.trim(),
    skillIds: draft.skillIds,
    subtasks: draft.subtasks.map(toTaskInput),
  };
}
