import { describe, expect, it, vi } from 'vitest';
import type { Developer } from '../../src/features/developers/developer.repository.js';
import type { Skill } from '../../src/features/skills/skill.repository.js';
import type {
  LockedTask,
  NewTask,
  Task,
  TaskRepository,
} from '../../src/features/tasks/task.repository.js';
import { createTaskService } from '../../src/features/tasks/task.service.js';
import { SkillIdentificationError, type SkillIdentifier } from '../../src/llm/skillIdentifier.js';

const DESIGN: Skill = { id: 1, name: 'Design', description: 'Visual work' };
const DATA: Skill = { id: 2, name: 'Data', description: 'Storage work' };
const DESIGNER: Developer = { id: 7, name: 'Pat', skills: [DESIGN], tasks: [] };

/** A service over in-memory fakes, proving the rules run with no database or HTTP. */
function setup(options: {
  identify?: SkillIdentifier['identify'];
  locked?: Partial<LockedTask>;
  unfinished?: { id: number; title: string }[];
}) {
  const inserted: NewTask[] = [];
  const update = vi.fn(async () => {});
  const warn = vi.fn();
  const tasks: TaskRepository = {
    findAll: async () => [],
    findTree: async () => ({ id: 1 }) as Task,
    findPendingSkills: async () => [],
    resolvePendingSkills: async () => true,
    transaction: (work) =>
      work({
        insert: async (task) => inserted.push(task),
        lock: async () => ({
          status: 'To-do',
          assigneeId: null,
          skillsSource: 'user',
          skills: [DESIGN],
          parentStatus: null,
          ...options.locked,
        }),
        findUnfinishedSubtasks: async () => options.unfinished ?? [],
        update,
      }),
  };
  const service = createTaskService({
    tasks,
    skills: { findAll: async () => [DESIGN, DATA], findById: async () => undefined },
    developers: {
      findAll: async () => [DESIGNER],
      findById: async (id) => (id === DESIGNER.id ? DESIGNER : undefined),
    },
    skillIdentifier: { identify: options.identify ?? (async () => []) },
    logger: { warn } as never,
  });
  return { service, inserted, update, warn };
}

const tree = {
  title: 'Root',
  skillIds: [],
  subtasks: [{ title: 'Child', skillIds: [1], subtasks: [] }],
};

describe('creating tasks', () => {
  it('sends only unspecified titles to the identifier, with the database catalogue', async () => {
    const identify = vi.fn(async () => [['Data']]);
    const { service, inserted } = setup({ identify });
    await service.create(tree);

    expect(identify).toHaveBeenCalledWith(['Root'], [DESIGN, DATA]);
    expect(inserted).toMatchObject([
      { title: 'Root', skillIds: [DATA.id], skillsSource: 'llm' },
      { title: 'Child', skillIds: [DESIGN.id], skillsSource: 'user', parentTaskId: 1 },
    ]);
  });

  it('falls back to pending and logs when identification fails', async () => {
    const { service, inserted, warn } = setup({
      identify: () => Promise.reject(new SkillIdentificationError('down')),
    });
    await service.create(tree);

    expect(inserted[0]).toMatchObject({ skillIds: [], skillsSource: 'pending' });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('treats a name outside the catalogue as unresolved', async () => {
    const { service, inserted } = setup({ identify: async () => [['Cooking']] });
    await service.create(tree);
    expect(inserted[0]).toMatchObject({ skillIds: [], skillsSource: 'pending' });
  });

  it('does not hide programming errors as an LLM outage', async () => {
    const { service } = setup({ identify: () => Promise.reject(new TypeError('bug')) });
    await expect(service.create(tree)).rejects.toThrow(TypeError);
  });

  it('does not write anything for an unknown skill id', async () => {
    const { service, inserted } = setup({});
    await expect(
      service.create({ title: 'x', skillIds: [99], subtasks: [] }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_SKILLS' });
    expect(inserted).toEqual([]);
  });
});

describe('updating tasks', () => {
  it('applies the skill rule and writes nothing on failure', async () => {
    const { service, update } = setup({ locked: { skills: [DESIGN, DATA] } });
    await expect(service.update(1, { assigneeId: DESIGNER.id })).rejects.toMatchObject({
      code: 'DEVELOPER_MISSING_SKILLS',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks assignment while skills are pending, but allows unassigning', async () => {
    const { service, update } = setup({ locked: { skillsSource: 'pending', skills: [] } });
    await expect(service.update(1, { assigneeId: DESIGNER.id })).rejects.toMatchObject({
      code: 'TASK_SKILLS_PENDING',
    });
    await service.update(1, { assigneeId: null });
    expect(update).toHaveBeenCalledOnce();
  });

  it('requires an assignee to start, counting one assigned in the same update', async () => {
    const { service, update } = setup({});
    await expect(service.update(1, { status: 'In Progress' })).rejects.toMatchObject({
      code: 'TASK_UNASSIGNED',
    });
    expect(update).not.toHaveBeenCalled();
    await service.update(1, { status: 'In Progress', assigneeId: DESIGNER.id });
    expect(update).toHaveBeenCalledOnce();
  });

  it('applies the Done rule', async () => {
    const { service } = setup({
      locked: { assigneeId: DESIGNER.id },
      unfinished: [{ id: 2, title: 'Open' }],
    });
    await expect(service.update(1, { status: 'Done' })).rejects.toMatchObject({
      code: 'SUBTASKS_NOT_DONE',
    });
    await expect(service.update(1, { status: 'In Progress' })).resolves.toBeDefined();
  });

  it('blocks reopening under a Done parent', async () => {
    const { service } = setup({ locked: { parentStatus: 'Done', status: 'Done' } });
    await expect(service.update(1, { status: 'To-do' })).rejects.toMatchObject({
      code: 'PARENT_TASK_DONE',
    });
  });
});
