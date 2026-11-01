import { describe, expect, it } from 'vitest';
import { DATA, DESIGN, DEVELOPERS, makeTask } from '../../../test/helpers';
import {
  applyUpdate,
  countBySkillsSource,
  findVisibleTasks,
  hasPendingSkills,
  NO_FILTERS,
  sortTasks,
  subtaskProgress,
} from './taskTree';

const child = makeTask({ id: 2, title: 'Store orders', skills: [DATA], status: 'Done' });
const sibling = makeTask({ id: 3, title: 'Style button', assignee: { id: 1, name: 'Alice' } });
const root = makeTask({ id: 1, title: 'Checkout', subtasks: [child, sibling] });
const other = makeTask({ id: 4, title: 'Audit log', status: 'In Progress' });

describe('findVisibleTasks', () => {
  it('keeps ancestors of a matching subtask, marked as context only', () => {
    const { matched, visible } = findVisibleTasks([root, other], {
      ...NO_FILTERS,
      search: 'ORDERS',
    });
    expect([...matched]).toEqual([2]);
    expect([...visible].sort()).toEqual([1, 2]);
  });

  it('hides a non-matching subtask of a matching parent', () => {
    const { visible } = findVisibleTasks([root], { ...NO_FILTERS, search: 'checkout' });
    expect([...visible]).toEqual([1]);
  });

  it('combines filters with AND', () => {
    const filters = { ...NO_FILTERS, status: 'Done' as const, skillId: DESIGN.id };
    expect(findVisibleTasks([root, other], filters).matched.size).toBe(0);
  });

  it('filters by assignee and by unassigned', () => {
    expect([...findVisibleTasks([root], { ...NO_FILTERS, assignee: 1 }).matched]).toEqual([3]);
    expect([
      ...findVisibleTasks([root], { ...NO_FILTERS, assignee: 'unassigned' }).matched,
    ]).toEqual([1, 2]);
  });
});

describe('sortTasks', () => {
  it('sorts top-level tasks without mutating or reordering subtasks', () => {
    const tasks = [root, other];
    expect(sortTasks(tasks, 'newest').map((t) => t.id)).toEqual([4, 1]);
    expect(sortTasks(tasks, 'oldest').map((t) => t.id)).toEqual([1, 4]);
    expect(sortTasks(tasks, 'title').map((t) => t.id)).toEqual([4, 1]);
    expect(sortTasks(tasks, 'status').map((t) => t.id)).toEqual([1, 4]);
    expect(tasks[0]).toBe(root);
    expect(sortTasks(tasks, 'title')[1]!.subtasks).toEqual([child, sibling]);
  });
});

describe('tree helpers', () => {
  it('counts direct subtask progress', () => {
    expect(subtaskProgress(root)).toEqual({ done: 1, total: 2 });
    expect(subtaskProgress(child)).toEqual({ done: 0, total: 0 });
  });

  it('finds pending skills at any depth', () => {
    expect(hasPendingSkills([root])).toBe(false);
    const nested = { ...root, subtasks: [{ ...child, skillsSource: 'pending' as const }] };
    expect(hasPendingSkills([nested])).toBe(true);
    expect(countBySkillsSource(nested, 'pending')).toBe(1);
  });

  it('applies an update to a nested task, resolving the assignee name', () => {
    const [updated] = applyUpdate([root], 3, { assigneeId: 2, status: 'Done' }, DEVELOPERS);
    expect(updated!.subtasks[1]).toMatchObject({
      status: 'Done',
      assignee: { id: 2, name: 'Bob' },
    });
    const [cleared] = applyUpdate([root], 3, { assigneeId: null }, DEVELOPERS);
    expect(cleared!.subtasks[1]!.assignee).toBeNull();
    expect(cleared!.subtasks[1]!.status).toBe('To-do');
    expect(root.subtasks[1]!.assignee?.name).toBe('Alice');
  });
});
