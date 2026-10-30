import { describe, expect, it } from 'vitest';
import {
  addSubtask,
  findBlankTitles,
  newDraft,
  removeDraft,
  toNewTask,
  updateDraft,
} from './taskDraft';

describe('task drafts', () => {
  it('adds, edits and removes nodes at any depth without mutating the original', () => {
    const root = newDraft();
    const withChild = addSubtask(root, root.key);
    const child = withChild.subtasks[0]!;
    const withGrandchild = addSubtask(withChild, child.key);
    const grandchild = withGrandchild.subtasks[0]!.subtasks[0]!;

    const edited = updateDraft(withGrandchild, grandchild.key, (node) => ({ ...node, title: 'x' }));
    expect(edited.subtasks[0]!.subtasks[0]!.title).toBe('x');
    expect(withGrandchild.subtasks[0]!.subtasks[0]!.title).toBe('');
    expect(root.subtasks).toEqual([]);

    expect(removeDraft(edited, grandchild.key).subtasks[0]!.subtasks).toEqual([]);
    expect(removeDraft(edited, child.key).subtasks).toEqual([]);
  });

  it('finds blank titles anywhere in the tree', () => {
    const root = { ...newDraft(), title: 'filled' };
    const tree = addSubtask(root, root.key);
    expect(findBlankTitles(tree)).toEqual(new Set([tree.subtasks[0]!.key]));
  });

  it('builds the API payload with trimmed titles and no client keys', () => {
    const root = { ...newDraft(), title: '  a  ', skillIds: [1] };
    const tree = updateDraft(addSubtask(root, root.key), root.key, (node) => node);
    expect(toNewTask(tree)).toEqual({
      title: 'a',
      skillIds: [1],
      subtasks: [{ title: '', skillIds: [], subtasks: [] }],
    });
  });
});
