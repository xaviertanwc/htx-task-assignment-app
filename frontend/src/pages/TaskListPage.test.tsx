import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BACKEND, DEVELOPERS, FRONTEND, makeTask, renderApp, stubApi } from '../test/helpers';
import type { Task } from '../api/types';

const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

const stubTasks = (tasks: Task[], extra = {}) =>
  stubApi({
    'GET /api/tasks': () => ({ body: tasks }),
    'GET /api/developers': () => ({ body: DEVELOPERS }),
    ...extra,
  });

describe('TaskListPage', () => {
  it('shows an empty state', async () => {
    stubTasks([]);
    renderApp('/');
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('lists tasks and nested subtasks with their attributes', async () => {
    stubTasks([
      makeTask({
        id: 1,
        title: 'Parent',
        skills: [FRONTEND, BACKEND],
        skillsSource: 'llm',
        assignee: { id: 3, name: 'Carol' },
        subtasks: [makeTask({ id: 2, title: 'Child', parentTaskId: 1 })],
      }),
    ]);
    renderApp('/');

    const parentRow = (await screen.findByText('Parent')).closest('tr')!;
    expect(parentRow).toHaveTextContent('Frontend, Backend');
    expect(within(parentRow).getByText('AI')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Assignee of Parent' })).toHaveValue('3');
    expect(screen.getByText('Child')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status of Child' })).toHaveValue('To-do');
  });

  it('offers only developers holding every required skill', async () => {
    stubTasks([
      makeTask({ id: 1, title: 'FE', skills: [FRONTEND] }),
      makeTask({ id: 2, title: 'BE', skills: [BACKEND] }),
      makeTask({ id: 3, title: 'Both', skills: [FRONTEND, BACKEND] }),
    ]);
    renderApp('/');

    const options = async (title: string) =>
      optionNames(await screen.findByRole('combobox', { name: `Assignee of ${title}` }));
    expect(await options('FE')).toEqual(['Unassigned', 'Alice', 'Carol']);
    expect(await options('BE')).toEqual(['Unassigned', 'Bob', 'Carol', 'Dave']);
    expect(await options('Both')).toEqual(['Unassigned', 'Carol']);
  });

  it('sends assignment and status changes to the API', async () => {
    const sent = stubTasks([makeTask({ id: 1, title: 'Task' })], {
      'PATCH /api/tasks/1': () => ({ body: {} }),
    });
    renderApp('/');
    const user = userEvent.setup();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Assignee of Task' }),
      '1',
    );
    await waitFor(() =>
      expect(sent).toContainEqual({ route: 'PATCH /api/tasks/1', body: { assigneeId: 1 } }),
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Status of Task' })).toBeEnabled(),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status of Task' }), 'Done');
    await waitFor(() =>
      expect(sent).toContainEqual({ route: 'PATCH /api/tasks/1', body: { status: 'Done' } }),
    );
  });

  it('disables Done until all subtasks are Done', async () => {
    stubTasks([
      makeTask({
        id: 1,
        title: 'Open parent',
        subtasks: [makeTask({ id: 2, title: 'Open child', parentTaskId: 1 })],
      }),
      makeTask({
        id: 3,
        title: 'Ready parent',
        subtasks: [makeTask({ id: 4, title: 'Done child', parentTaskId: 3, status: 'Done' })],
      }),
    ]);
    renderApp('/');

    const openSelect = await screen.findByRole('combobox', { name: 'Status of Open parent' });
    expect(within(openSelect).getByRole('option', { name: /Done/ })).toBeDisabled();
    const readySelect = screen.getByRole('combobox', { name: 'Status of Ready parent' });
    expect(within(readySelect).getByRole('option', { name: 'Done' })).toBeEnabled();
  });

  it('locks the status of a subtask whose parent is Done', async () => {
    stubTasks([
      makeTask({
        id: 1,
        title: 'Done parent',
        status: 'Done',
        subtasks: [makeTask({ id: 2, title: 'Done child', parentTaskId: 1, status: 'Done' })],
      }),
    ]);
    renderApp('/');
    expect(await screen.findByRole('combobox', { name: 'Status of Done child' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Status of Done parent' })).toBeEnabled();
  });

  it('shows the server message on the row when an update is rejected', async () => {
    stubTasks([makeTask({ id: 1, title: 'Task' })], {
      'PATCH /api/tasks/1': () => ({
        status: 409,
        body: { error: { code: 'SUBTASKS_NOT_DONE', message: 'Finish subtasks first.' } },
      }),
    });
    renderApp('/');
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Status of Task' }),
      'Done',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Finish subtasks first.');
    expect(screen.getByRole('combobox', { name: 'Status of Task' })).toHaveValue('To-do');
  });

  it('reports a load failure', async () => {
    stubApi({
      'GET /api/tasks': () => ({ status: 500, body: {} }),
      'GET /api/developers': () => ({ body: DEVELOPERS }),
    });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
