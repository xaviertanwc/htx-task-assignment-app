import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Task } from '../../../shared/api/types';
import { DATA, DESIGN, makeTask, renderApp, stubApi } from '../../../test/helpers';

const CAROL = { id: 3, name: 'Carol' };

const select = (name: string) => screen.findByRole('combobox', { name });
const options = (element: HTMLElement) => within(element).getAllByRole('option');

describe('TaskListPage', () => {
  it('shows a loading state, then an empty state', async () => {
    stubApi({});
    renderApp('/');
    expect(screen.getByRole('status', { name: 'Loading tasks' })).toBeInTheDocument();
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('reports a load failure and can retry', async () => {
    let healthy = false;
    stubApi({
      'GET /tasks': () => (healthy ? { body: { data: [] } } : { status: 500, body: {} }),
    });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');

    healthy = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('lists nested tasks with attributes, progress and auto-detected skills', async () => {
    stubApi({}, [
      makeTask({
        id: 1,
        title: 'Parent',
        skills: [DESIGN, DATA],
        skillsSource: 'llm',
        assignee: { id: 3, name: 'Carol' },
        subtasks: [
          makeTask({ id: 2, title: 'Open child', parentTaskId: 1 }),
          makeTask({ id: 3, title: 'Done child', parentTaskId: 1, status: 'Done' }),
        ],
      }),
    ]);
    renderApp('/');

    const parentRow = (await screen.findByText('Parent')).closest('tr')!;
    expect(parentRow).toHaveTextContent('Design, Data');
    expect(parentRow).toHaveTextContent('Auto-detected');
    expect(parentRow).toHaveTextContent('1/2 done');
    expect(await select('Assignee of Parent')).toHaveValue('3');
    expect(await select('Status of Open child')).toHaveValue('To-do');
  });

  it('collapses and expands subtasks by keyboard-reachable button', async () => {
    stubApi({}, [
      makeTask({
        id: 1,
        title: 'Parent',
        subtasks: [makeTask({ id: 2, title: 'Child', parentTaskId: 1 })],
      }),
    ]);
    renderApp('/');
    const user = userEvent.setup();

    const collapse = await screen.findByRole('button', { name: 'Collapse subtasks of Parent' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await user.click(collapse);
    expect(screen.queryByText('Child')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand subtasks of Parent' }));
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('explains why a developer is unavailable and only enables qualified ones', async () => {
    stubApi({}, [makeTask({ id: 1, title: 'Both', skills: [DESIGN, DATA] })]);
    renderApp('/');

    const [unassigned, alice, bob, carol] = options(await select('Assignee of Both'));
    expect(unassigned).toBeEnabled();
    expect(alice).toBeDisabled();
    expect(alice).toHaveTextContent('Alice (missing Data)');
    expect(bob).toBeDisabled();
    expect(bob).toHaveTextContent('Bob (missing Design)');
    expect(carol).toBeEnabled();
    expect(carol).toHaveTextContent(/^Carol$/);
  });

  it('blocks leaving To-do with an explanation until someone is assigned', async () => {
    stubApi({}, [
      makeTask({ id: 1, title: 'Unassigned' }),
      makeTask({ id: 2, title: 'Started', status: 'In Progress' }),
    ]);
    renderApp('/');

    const unassigned = await select('Status of Unassigned');
    expect(within(unassigned).getByRole('option', { name: 'To-do' })).toBeEnabled();
    expect(within(unassigned).getByRole('option', { name: 'In Progress' })).toBeDisabled();
    expect(within(unassigned).getByRole('option', { name: 'Done' })).toBeDisabled();
    expect(unassigned).toHaveAccessibleDescription('Assign someone to start this task.');

    // The rule governs leaving To-do only, so an unassigned task already underway can move on.
    const started = await select('Status of Started');
    expect(within(started).getByRole('option', { name: 'Done' })).toBeEnabled();
  });

  it('disables Done with an explanation until all subtasks are Done', async () => {
    stubApi({}, [
      makeTask({
        id: 1,
        title: 'Open parent',
        assignee: CAROL,
        subtasks: [makeTask({ id: 2, title: 'Open child', parentTaskId: 1 })],
      }),
      makeTask({
        id: 3,
        title: 'Ready parent',
        assignee: CAROL,
        subtasks: [makeTask({ id: 4, title: 'Finished', parentTaskId: 3, status: 'Done' })],
      }),
    ]);
    renderApp('/');

    const open = await select('Status of Open parent');
    expect(within(open).getByRole('option', { name: 'Done' })).toBeDisabled();
    expect(open).toHaveAccessibleDescription('Done unlocks when all subtasks are Done.');

    const ready = await select('Status of Ready parent');
    expect(within(ready).getByRole('option', { name: 'Done' })).toBeEnabled();
    expect(ready).not.toHaveAccessibleDescription();
  });

  it('locks the status of a subtask whose parent is Done, and says why', async () => {
    stubApi({}, [
      makeTask({
        id: 1,
        title: 'Done parent',
        status: 'Done',
        subtasks: [makeTask({ id: 2, title: 'Done child', parentTaskId: 1, status: 'Done' })],
      }),
    ]);
    renderApp('/');
    const child = await select('Status of Done child');
    expect(child).toBeDisabled();
    expect(child).toHaveAccessibleDescription(/reopen the parent/);
    expect(await select('Status of Done parent')).toBeEnabled();
  });

  it('blocks assignment while skills are pending', async () => {
    stubApi({}, [makeTask({ id: 1, title: 'Pending', skills: [], skillsSource: 'pending' })]);
    renderApp('/');
    expect(await select('Assignee of Pending')).toBeDisabled();
    expect(screen.getByText('Detecting skills…')).toBeInTheDocument();
    expect(screen.getByText('Assignable once skills are detected.')).toBeInTheDocument();
  });

  it('updates optimistically and confirms with a toast', async () => {
    let tasks: Task[] = [makeTask({ id: 1, title: 'Task', assignee: CAROL })];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const sent = stubApi({
      'GET /tasks': () => ({ body: { data: tasks } }),
      'PATCH /tasks/1': () => {
        tasks = [makeTask({ id: 1, title: 'Task', assignee: CAROL, status: 'In Progress' })];
        return { body: { data: tasks[0] } };
      },
    });
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') await gate;
      return original(url, init);
    }) as typeof fetch;

    renderApp('/');
    await userEvent.selectOptions(await select('Status of Task'), 'In Progress');

    // Shown before the server has answered.
    expect(await select('Status of Task')).toHaveValue('In Progress');
    expect(sent).toEqual([]);

    release();
    expect(await screen.findByText('Status updated.')).toBeInTheDocument();
    expect(sent).toEqual([{ route: 'PATCH /tasks/1', body: { status: 'In Progress' } }]);
  });

  describe('unassigning', () => {
    it('unassigns a To-do task without asking', async () => {
      const sent = stubApi({ 'PATCH /tasks/1': () => ({ body: { data: {} } }) }, [
        makeTask({ id: 1, title: 'Not started', assignee: CAROL }),
      ]);
      renderApp('/');
      await userEvent.selectOptions(await select('Assignee of Not started'), 'Unassigned');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() =>
        expect(sent).toEqual([{ route: 'PATCH /tasks/1', body: { assigneeId: null } }]),
      );
    });

    it('warns before unassigning started work, and keeps the developer on cancel', async () => {
      const sent = stubApi({}, [
        makeTask({ id: 1, title: 'Started', assignee: CAROL, status: 'In Progress' }),
      ]);
      renderApp('/');
      const user = userEvent.setup();
      await user.selectOptions(await select('Assignee of Started'), 'Unassigned');

      const dialog = screen.getByRole('dialog', { name: 'Unassign Carol?' });
      expect(dialog).toHaveTextContent('leaves started work without an owner');
      await user.click(within(dialog).getByRole('button', { name: 'Keep Carol' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await select('Assignee of Started')).toHaveValue('3');
      expect(await select('Assignee of Started')).toHaveFocus();
      expect(sent).toEqual([]);
    });

    it('unassigns finished work once confirmed, explaining what is lost', async () => {
      const sent = stubApi({ 'PATCH /tasks/1': () => ({ body: { data: {} } }) }, [
        makeTask({ id: 1, title: 'Finished', assignee: CAROL, status: 'Done' }),
      ]);
      renderApp('/');
      const user = userEvent.setup();
      await user.selectOptions(await select('Assignee of Finished'), 'Unassigned');

      const dialog = screen.getByRole('dialog', { name: 'Unassign Carol?' });
      expect(dialog).toHaveTextContent('removes the record of who completed it');
      await user.click(within(dialog).getByRole('button', { name: 'Unassign' }));

      await waitFor(() =>
        expect(sent).toEqual([{ route: 'PATCH /tasks/1', body: { assigneeId: null } }]),
      );
      expect(await screen.findByText('Assignee removed.')).toBeInTheDocument();
    });

    it('does not ask when switching to another qualified developer', async () => {
      const sent = stubApi({ 'PATCH /tasks/1': () => ({ body: { data: {} } }) }, [
        makeTask({ id: 1, title: 'Started', assignee: CAROL, status: 'In Progress' }),
      ]);
      renderApp('/');
      await userEvent.selectOptions(await select('Assignee of Started'), 'Alice');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(sent).toHaveLength(1));
    });
  });

  it('rolls back and shows the server message when an update is rejected', async () => {
    stubApi(
      {
        'PATCH /tasks/1': () => ({
          status: 409,
          body: { error: { code: 'SUBTASKS_NOT_DONE', message: 'Finish subtasks first.' } },
        }),
      },
      [makeTask({ id: 1, title: 'Task', assignee: CAROL })],
    );
    renderApp('/');
    await userEvent.selectOptions(await select('Status of Task'), 'Done');

    expect(await screen.findByText('Finish subtasks first.')).toBeInTheDocument();
    await waitFor(async () => expect(await select('Status of Task')).toHaveValue('To-do'));
  });

  describe('filters', () => {
    const tasks = [
      makeTask({
        id: 1,
        title: 'Checkout',
        subtasks: [
          makeTask({ id: 2, title: 'Store orders', parentTaskId: 1, skills: [DATA] }),
          makeTask({ id: 3, title: 'Style button', parentTaskId: 1 }),
        ],
      }),
      makeTask({ id: 4, title: 'Audit log', skills: [DATA], status: 'Done' }),
    ];

    it('searches titles, keeping a match in its tree, and stores it in the URL', async () => {
      stubApi({}, tasks);
      const { router } = renderApp('/');
      await userEvent.type(await screen.findByRole('searchbox'), 'orders');

      expect(screen.getByText('Store orders')).toBeInTheDocument();
      expect(screen.getByText('Checkout').closest('tr')).toHaveClass('context-row');
      expect(screen.queryByText('Style button')).not.toBeInTheDocument();
      expect(screen.queryByText('Audit log')).not.toBeInTheDocument();
      expect(router.state.location.search).toBe('?search=orders');
    });

    it('restores filters from the URL', async () => {
      stubApi({}, tasks);
      renderApp('/?status=Done');
      expect(await screen.findByText('Audit log')).toBeInTheDocument();
      expect(screen.queryByText('Checkout')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Done');
    });

    it('filters by skill using skills from the API, and can clear a dead end', async () => {
      stubApi({}, tasks);
      renderApp('/');
      const user = userEvent.setup();
      await screen.findByText('Checkout');

      await user.selectOptions(screen.getByRole('combobox', { name: 'Skill' }), 'Data');
      expect(screen.getByText('Store orders')).toBeInTheDocument();
      expect(screen.queryByText('Style button')).not.toBeInTheDocument();

      await user.type(screen.getByRole('searchbox'), 'nothing matches');
      expect(screen.getByText('No tasks match these filters.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(screen.getByText('Audit log')).toBeInTheDocument();
    });

    it('sorts top-level tasks', async () => {
      stubApi({}, tasks);
      renderApp('/');
      await screen.findByText('Checkout');
      const firstTitle = () =>
        within(screen.getAllByRole('row')[1]!).getAllByRole('cell')[0]!.textContent;
      expect(firstTitle()).toContain('Audit log');
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Sort by' }),
        'Oldest first',
      );
      expect(firstTitle()).toContain('Checkout');
    });
  });

  it('polls only while skills are pending', async () => {
    stubApi({}, [makeTask({ id: 1, title: 'Task' })]);
    renderApp('/');
    await screen.findByText('Task');
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls
      .length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      before,
    );
  });
});
