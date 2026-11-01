import { describe, expect, it } from 'vitest';
import {
  appendSubtask,
  countDescendants,
  findBlankTitles,
  isPristine,
  newDraft,
  removeDraft,
  toTaskInput,
  updateDraft,
} from './taskDraft';

describe('task drafts', () => {
  it('adds, edits and removes nodes at any depth without mutating the original', () => {
    const root = newDraft();
    const child = newDraft();
    const grandchild = newDraft();
    const tree = appendSubtask(appendSubtask(root, root.key, child), child.key, grandchild);

    const edited = updateDraft(tree, grandchild.key, (node) => ({ ...node, title: 'x' }));
    expect(edited.subtasks[0]!.subtasks[0]!.title).toBe('x');
    expect(tree.subtasks[0]!.subtasks[0]!.title).toBe('');
    expect(root.subtasks).toEqual([]);

    expect(countDescendants(edited)).toBe(2);
    expect(removeDraft(edited, grandchild.key).subtasks[0]!.subtasks).toEqual([]);
    expect(removeDraft(edited, child.key).subtasks).toEqual([]);
  });

  it('lists blank titles in page order', () => {
    const root = newDraft();
    const filled = { ...newDraft(), title: 'filled' };
    const blank = newDraft();
    const tree = appendSubtask(appendSubtask(root, root.key, filled), root.key, blank);
    expect(findBlankTitles(tree)).toEqual([root.key, blank.key]);
  });

  it('knows when there is nothing to lose', () => {
    const root = newDraft();
    expect(isPristine(root)).toBe(true);
    expect(isPristine({ ...root, title: 'x' })).toBe(false);
    expect(isPristine({ ...root, skillIds: [1] })).toBe(false);
    expect(isPristine(appendSubtask(root, root.key, newDraft()))).toBe(false);
  });

  it('builds the API payload with trimmed titles and no client keys', () => {
    const root = { ...newDraft(), title: '  a  ', skillIds: [1] };
    expect(toTaskInput(appendSubtask(root, root.key, newDraft()))).toEqual({
      title: 'a',
      skillIds: [1],
      subtasks: [{ title: '', skillIds: [], subtasks: [] }],
    });
  });
});
