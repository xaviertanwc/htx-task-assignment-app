import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { createPool, type Db } from '../src/db/pool.js';
import { SkillIdentificationError, type SkillIdentifier } from '../src/llm/skillIdentifier.js';

interface Named {
  name: string;
}
interface TaskBody {
  title: string;
}

const FRONTEND = 1;
const BACKEND = 2;
const ALICE = 1; // Frontend
const BOB = 2; // Backend
const CAROL = 3; // Frontend, Backend

let db: Db;
let identify: SkillIdentifier['identify'];
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = createPool(inject('databaseUrl'));
  await runMigrations(db);
  app = createApp({
    db,
    skillIdentifier: { identify: (titles, skills) => identify(titles, skills) },
    logger: pino({ level: 'silent' }),
  });
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query('TRUNCATE tasks RESTART IDENTITY CASCADE');
  identify = () => Promise.reject(new Error('The LLM should not have been called.'));
});

const createTask = async (body: object) => {
  const res = await request(app).post('/api/tasks').send(body);
  expect(res.status).toBe(201);
  return res.body;
};
const patchTask = (id: number, body: object) => request(app).patch(`/api/tasks/${id}`).send(body);

describe('migrations', () => {
  it('are idempotent', async () => {
    await expect(runMigrations(db)).resolves.toEqual([]);
  });
});

describe('seed data', () => {
  it('contains the developers and skills from the brief', async () => {
    const skills = await request(app).get('/api/skills');
    expect(skills.body).toEqual([
      { id: FRONTEND, name: 'Frontend' },
      { id: BACKEND, name: 'Backend' },
    ]);

    const developers = await request(app).get('/api/developers');
    const summary = developers.body.map((d: Named & { skills: Named[] }) => [
      d.name,
      d.skills.map((s) => s.name),
    ]);
    expect(summary).toEqual([
      ['Alice', ['Frontend']],
      ['Bob', ['Backend']],
      ['Carol', ['Frontend', 'Backend']],
      ['Dave', ['Backend']],
    ]);
  });
});

describe('reading developers and skills', () => {
  it('reads one skill, and 404s on an unknown one', async () => {
    expect((await request(app).get(`/api/skills/${BACKEND}`)).body.name).toBe('Backend');
    expect((await request(app).get('/api/skills/999')).status).toBe(404);
  });

  it('reads one developer with assigned tasks', async () => {
    const task = await createTask({ title: 'Page', skillIds: [FRONTEND] });
    await patchTask(task.id, { assigneeId: ALICE }).expect(200);

    const res = await request(app).get(`/api/developers/${ALICE}`);
    expect(res.body.tasks).toEqual([{ id: task.id, title: 'Page', status: 'To-do' }]);
    expect((await request(app).get('/api/developers/999')).status).toBe(404);
  });

  it('rejects a malformed id', async () => {
    expect((await request(app).get('/api/developers/abc')).status).toBe(400);
    expect((await request(app).get('/api/tasks/99999999999')).status).toBe(400);
  });
});

describe('creating tasks', () => {
  it('creates a task as To-do and unassigned, and reads it back', async () => {
    const created = await createTask({ title: '  Homepage  ', skillIds: [FRONTEND] });
    expect(created).toMatchObject({
      title: 'Homepage',
      status: 'To-do',
      assignee: null,
      parentTaskId: null,
      skillsSource: 'user',
      skills: [{ id: FRONTEND, name: 'Frontend' }],
      subtasks: [],
    });
    const read = await request(app).get(`/api/tasks/${created.id}`);
    expect(read.body).toEqual(created);
  });

  it('creates nested subtasks and lists only roots at the top level', async () => {
    const root = await createTask({
      title: '1',
      skillIds: [FRONTEND],
      subtasks: [
        {
          title: '1.1',
          skillIds: [BACKEND],
          subtasks: [
            { title: '1.1.1', skillIds: [FRONTEND] },
            { title: '1.1.2', skillIds: [BACKEND] },
          ],
        },
      ],
    });
    expect(root.subtasks[0].parentTaskId).toBe(root.id);
    expect(root.subtasks[0].subtasks.map((t: TaskBody) => t.title)).toEqual(['1.1.1', '1.1.2']);

    const list = await request(app).get('/api/tasks');
    expect(list.body.map((t: TaskBody) => t.title)).toEqual(['1']);
    expect(list.body[0].subtasks[0].subtasks).toHaveLength(2);

    const subtree = await request(app).get(`/api/tasks/${root.subtasks[0].id}`);
    expect(subtree.body.title).toBe('1.1');
    expect(subtree.body.subtasks).toHaveLength(2);
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['a missing title', {}],
    ['an unknown field', { title: 'x', assigneeId: 1 }],
    ['an invalid subtask', { title: 'x', subtasks: [{ title: '' }] }],
  ])('rejects %s', async (_name, body) => {
    const res = await request(app).post('/api/tasks').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown skill ids without saving', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'x', skillIds: [999] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_SKILLS');
    expect((await request(app).get('/api/tasks')).body).toEqual([]);
  });

  it('rejects trees that are too deep or too large', async () => {
    // Built as text because the test client cannot itself serialise an object this deep.
    let deep = '{"title":"leaf"}';
    for (let i = 0; i < 2000; i++) deep = `{"title":"x","subtasks":[${deep}]}`;
    const tooDeep = await request(app)
      .post('/api/tasks')
      .set('content-type', 'application/json')
      .send(deep);
    expect(tooDeep.body.error.code).toBe('TASK_TREE_TOO_LARGE');

    const wide = { title: 'x', subtasks: Array.from({ length: 100 }, () => ({ title: 'y' })) };
    const tooWide = await request(app).post('/api/tasks').send(wide);
    expect(tooWide.body.error.code).toBe('TASK_TREE_TOO_LARGE');
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('content-type', 'application/json')
      .send('{"title":');
    expect(res.status).toBe(400);
  });
});

describe('identifying skills with the LLM', () => {
  it('asks once, only about tasks without skills, and stores the answer', async () => {
    const calls: { titles: string[]; skills: string[] }[] = [];
    identify = async (titles, skills) => {
      calls.push({ titles, skills });
      return [['Frontend', 'Backend'], ['Backend']];
    };

    const root = await createTask({
      title: 'Needs LLM',
      subtasks: [
        { title: 'User chose', skillIds: [FRONTEND] },
        { title: 'Also needs LLM' },
      ],
    });

    expect(calls).toEqual([
      { titles: ['Needs LLM', 'Also needs LLM'], skills: ['Frontend', 'Backend'] },
    ]);
    expect(root.skillsSource).toBe('llm');
    expect(root.skills.map((s: Named) => s.name)).toEqual(['Frontend', 'Backend']);

    const [userChosen, llmChosen] = root.subtasks;
    expect(userChosen).toMatchObject({ skillsSource: 'user', skills: [{ name: 'Frontend' }] });
    expect(llmChosen).toMatchObject({ skillsSource: 'llm', skills: [{ name: 'Backend' }] });
  });

  it('does not call the LLM when every task has skills', async () => {
    // The default `identify` rejects, so a call here would fail the request.
    await createTask({ title: 'x', skillIds: [FRONTEND] });
  });

  it('saves nothing and returns 503 when identification fails', async () => {
    identify = () => Promise.reject(new SkillIdentificationError('down'));
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'x', skillIds: [FRONTEND], subtasks: [{ title: 'y' }] });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SKILL_IDENTIFICATION_FAILED');
    expect((await request(app).get('/api/tasks')).body).toEqual([]);
  });
});

describe('assigning tasks', () => {
  it('allows a developer with the required skill', async () => {
    const task = await createTask({ title: 'x', skillIds: [FRONTEND] });
    const res = await patchTask(task.id, { assigneeId: ALICE });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toEqual({ id: ALICE, name: 'Alice' });
  });

  it('rejects a developer without the required skill', async () => {
    const task = await createTask({ title: 'x', skillIds: [FRONTEND] });
    const res = await patchTask(task.id, { assigneeId: BOB });
    expect(res.status).toBe(422);
    expect(res.body.error.details.missingSkills).toEqual(['Frontend']);
    expect((await request(app).get(`/api/tasks/${task.id}`)).body.assignee).toBeNull();
  });

  it('requires all skills on a multi-skill task', async () => {
    const task = await createTask({ title: 'x', skillIds: [FRONTEND, BACKEND] });
    expect((await patchTask(task.id, { assigneeId: ALICE })).status).toBe(422);
    expect((await patchTask(task.id, { assigneeId: BOB })).status).toBe(422);
    expect((await patchTask(task.id, { assigneeId: CAROL })).status).toBe(200);
  });

  it('applies the same rule to subtasks', async () => {
    const root = await createTask({
      title: 'x',
      skillIds: [FRONTEND],
      subtasks: [{ title: 'y', skillIds: [BACKEND] }],
    });
    expect((await patchTask(root.subtasks[0].id, { assigneeId: ALICE })).status).toBe(422);
    expect((await patchTask(root.subtasks[0].id, { assigneeId: BOB })).status).toBe(200);
  });

  it('unassigns with null and leaves the status alone', async () => {
    const task = await createTask({ title: 'x', skillIds: [FRONTEND] });
    await patchTask(task.id, { assigneeId: ALICE, status: 'In Progress' }).expect(200);
    const res = await patchTask(task.id, { assigneeId: null });
    expect(res.body).toMatchObject({ assignee: null, status: 'In Progress' });
  });

  it('keeps the assignee when only the status changes', async () => {
    const task = await createTask({ title: 'x', skillIds: [FRONTEND] });
    await patchTask(task.id, { assigneeId: ALICE }).expect(200);
    const res = await patchTask(task.id, { status: 'Done' });
    expect(res.body).toMatchObject({ assignee: { id: ALICE }, status: 'Done' });
  });

  it('rejects an unknown developer, task and status', async () => {
    const task = await createTask({ title: 'x', skillIds: [FRONTEND] });
    expect((await patchTask(task.id, { assigneeId: 999 })).status).toBe(422);
    expect((await patchTask(999, { status: 'Done' })).status).toBe(404);
    expect((await patchTask(task.id, { status: 'Nope' })).status).toBe(400);
    expect((await patchTask(task.id, {})).status).toBe(400);
  });

  it('applies nothing when one part of an update is invalid', async () => {
    const task = await createTask({ title: 'x', skillIds: [FRONTEND] });
    expect((await patchTask(task.id, { status: 'Done', assigneeId: BOB })).status).toBe(422);
    expect((await request(app).get(`/api/tasks/${task.id}`)).body.status).toBe('To-do');
  });
});

describe('the Done rule', () => {
  const nestedTree = () =>
    createTask({
      title: 'root',
      skillIds: [FRONTEND],
      subtasks: [
        {
          title: 'child',
          skillIds: [FRONTEND],
          subtasks: [{ title: 'grandchild', skillIds: [FRONTEND] }],
        },
      ],
    });

  it('blocks Done until all subtasks are Done, at every level', async () => {
    const root = await nestedTree();
    const child = root.subtasks[0];
    const grandchild = child.subtasks[0];

    const blocked = await patchTask(root.id, { status: 'Done' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SUBTASKS_NOT_DONE');
    expect(blocked.body.error.details.unfinishedSubtasks).toEqual([
      { id: child.id, title: 'child' },
    ]);
    expect((await patchTask(child.id, { status: 'Done' })).status).toBe(409);

    await patchTask(grandchild.id, { status: 'Done' }).expect(200);
    await patchTask(child.id, { status: 'Done' }).expect(200);
    await patchTask(root.id, { status: 'Done' }).expect(200);
  });

  it('allows non-Done status changes while subtasks are open', async () => {
    const root = await nestedTree();
    await patchTask(root.id, { status: 'In Progress' }).expect(200);
  });

  it('blocks reopening a subtask of a Done parent until the parent is reopened', async () => {
    const root = await createTask({
      title: 'root',
      skillIds: [FRONTEND],
      subtasks: [{ title: 'child', skillIds: [FRONTEND] }],
    });
    const child = root.subtasks[0];
    await patchTask(child.id, { status: 'Done' }).expect(200);
    await patchTask(root.id, { status: 'Done' }).expect(200);

    const res = await patchTask(child.id, { status: 'To-do' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_TASK_DONE');

    await patchTask(root.id, { status: 'To-do' }).expect(200);
    await patchTask(child.id, { status: 'To-do' }).expect(200);
  });

  it('never leaves a Done parent with an unfinished subtask under concurrent updates', async () => {
    for (let round = 0; round < 25; round++) {
      const root = await createTask({
        title: 'root',
        skillIds: [FRONTEND],
        subtasks: [{ title: 'child', skillIds: [FRONTEND] }],
      });
      const child = root.subtasks[0];
      await patchTask(child.id, { status: 'Done' }).expect(200);

      await Promise.all([
        patchTask(root.id, { status: 'Done' }),
        patchTask(child.id, { status: 'To-do' }),
      ]);

      const after = (await request(app).get(`/api/tasks/${root.id}`)).body;
      if (after.status === 'Done') expect(after.subtasks[0].status).toBe('Done');
    }
  });
});

describe('routing', () => {
  it('reports health and 404s unknown routes as JSON', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
