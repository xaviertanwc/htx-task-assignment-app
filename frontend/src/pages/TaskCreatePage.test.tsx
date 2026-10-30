import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BACKEND, DEVELOPERS, FRONTEND, makeTask, renderApp, stubApi } from '../test/helpers';

const baseRoutes = {
  'GET /api/skills': () => ({ body: [FRONTEND, BACKEND] }),
  'GET /api/tasks': () => ({ body: [] }),
  'GET /api/developers': () => ({ body: DEVELOPERS }),
};

const fieldset = (name: string) => screen.getByRole('group', { name });

describe('TaskCreatePage', () => {
  it('creates a task without choosing skills or an assignee', async () => {
    const sent = stubApi({
      ...baseRoutes,
      'POST /api/tasks': () => ({ status: 201, body: makeTask({ id: 1, title: 'x' }) }),
    });
    renderApp('/tasks/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), 'A task');
    expect(screen.getByText('AI will identify these')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(sent).toEqual([
        { route: 'POST /api/tasks', body: { title: 'A task', skillIds: [], subtasks: [] } },
      ]),
    );
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
  });

  it('renders nested subtask components dynamically and submits the tree', async () => {
    const sent = stubApi({
      ...baseRoutes,
      'POST /api/tasks': () => ({ status: 201, body: makeTask({ id: 1, title: 'x' }) }),
    });
    renderApp('/tasks/new');
    const user = userEvent.setup();

    const task1 = await screen.findByRole('group', { name: 'Task 1' });
    await user.type(within(task1).getByLabelText('Title'), 'One');
    await user.click(within(task1).getByRole('checkbox', { name: 'Frontend' }));
    await user.click(within(task1).getByRole('button', { name: 'Add Subtask' }));

    const task11 = fieldset('Subtask 1.1');
    await user.type(within(task11).getByLabelText('Title'), 'One.one');
    await user.click(within(task11).getByRole('button', { name: 'Add Subtask' }));
    await user.click(within(task11).getByRole('button', { name: 'Add Subtask' }));

    await user.type(within(fieldset('Subtask 1.1.1')).getByLabelText('Title'), 'Deep one');
    const task112 = fieldset('Subtask 1.1.2');
    await user.type(within(task112).getByLabelText('Title'), 'Deep two');
    await user.click(within(task112).getByRole('checkbox', { name: 'Backend' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({
      title: 'One',
      skillIds: [FRONTEND.id],
      subtasks: [
        {
          title: 'One.one',
          skillIds: [],
          subtasks: [
            { title: 'Deep one', skillIds: [], subtasks: [] },
            { title: 'Deep two', skillIds: [BACKEND.id], subtasks: [] },
          ],
        },
      ],
    });
  });

  it('removes a subtask and renumbers its siblings', async () => {
    stubApi(baseRoutes);
    renderApp('/tasks/new');
    const user = userEvent.setup();

    const add = within(await screen.findByRole('group', { name: 'Task 1' })).getByRole('button', {
      name: 'Add Subtask',
    });
    await user.click(add);
    await user.click(add);
    await user.type(within(fieldset('Subtask 1.2')).getByLabelText('Title'), 'Keep me');

    await user.click(within(fieldset('Subtask 1.1')).getByRole('button', { name: 'Remove' }));

    expect(within(fieldset('Subtask 1.1')).getByLabelText('Title')).toHaveValue('Keep me');
    expect(screen.queryByRole('group', { name: 'Subtask 1.2' })).not.toBeInTheDocument();
  });

  it('blocks submission and flags every blank title, including subtasks', async () => {
    const sent = stubApi(baseRoutes);
    renderApp('/tasks/new');
    const user = userEvent.setup();

    const task1 = await screen.findByRole('group', { name: 'Task 1' });
    await user.click(within(task1).getByRole('button', { name: 'Add Subtask' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getAllByText('Enter a title.')).toHaveLength(2);
    expect(sent).toEqual([]);
  });

  it('keeps the form and shows the error when saving fails', async () => {
    stubApi({
      ...baseRoutes,
      'POST /api/tasks': () => ({
        status: 503,
        body: { error: { code: 'SKILL_IDENTIFICATION_FAILED', message: 'Nothing was saved.' } },
      }),
    });
    renderApp('/tasks/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), 'Keep this text');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was saved.');
    expect(screen.getByLabelText('Title')).toHaveValue('Keep this text');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
