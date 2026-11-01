import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DATA, DESIGN, makeTask, renderApp, respondWith, stubApi } from '../../../test/helpers';

const created = (overrides = {}) =>
  respondWithStatus(makeTask({ id: 1, title: 'x', ...overrides }));
const respondWithStatus = (data: unknown) => () => ({ status: 201, ...respondWith(data)() });

const group = (name: string) => screen.getByRole('group', { name });
const title = (name: string) => within(group(name)).getByRole('textbox');

describe('TaskCreatePage', () => {
  it('creates a task without choosing skills or an assignee, and redirects with a toast', async () => {
    const sent = stubApi({ 'POST /tasks': created() });
    const { router } = renderApp('/tasks/new');
    const user = userEvent.setup();

    await user.type(await screen.findByRole('textbox'), 'A task');
    expect(screen.getByText(/detect skills automatically with AI/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(sent).toEqual([
      { route: 'POST /tasks', body: { title: 'A task', skillIds: [], subtasks: [] } },
    ]);
    expect(await screen.findByText('Task created.')).toBeInTheDocument();
  });

  it('says when skills were auto-detected or are still pending', async () => {
    stubApi({ 'POST /tasks': created({ skillsSource: 'llm' }) });
    const { unmount } = renderApp('/tasks/new');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox'), 'A task');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/auto-detected for 1 task\./)).toBeInTheDocument();
    unmount();

    stubApi({ 'POST /tasks': created({ skillsSource: 'pending', skills: [] }) });
    renderApp('/tasks/new');
    await user.type(await screen.findByRole('textbox'), 'A task');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/will be retried automatically/)).toBeInTheDocument();
  });

  it('renders skills from the API as chips', async () => {
    stubApi({});
    renderApp('/tasks/new');
    const chips = await screen.findByRole('group', { name: 'Skills for Task 1' });
    expect(within(chips).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(chips).getByRole('checkbox', { name: DESIGN.name })).not.toBeChecked();
  });

  it('builds nested subtasks numbered 1.1.1, moves focus to each, and submits the tree', async () => {
    const sent = stubApi({ 'POST /tasks': created() });
    renderApp('/tasks/new');
    const user = userEvent.setup();

    await screen.findByRole('group', { name: 'Task 1' });
    await user.type(title('Task 1'), 'One');
    await user.click(screen.getAllByRole('checkbox', { name: DESIGN.name })[0]!);
    await user.click(screen.getByRole('button', { name: 'Add subtask to Task 1' }));
    expect(title('Subtask 1.1')).toHaveFocus();

    await user.keyboard('One.one');
    const addTo11 = screen.getByRole('button', { name: 'Add subtask to Subtask 1.1' });
    await user.click(addTo11);
    expect(title('Subtask 1.1.1')).toHaveFocus();
    await user.keyboard('Deep one');
    await user.click(addTo11);
    await user.keyboard('Deep two');
    await user.click(within(group('Subtask 1.1.2')).getByRole('checkbox', { name: DATA.name }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({
      title: 'One',
      skillIds: [DESIGN.id],
      subtasks: [
        {
          title: 'One.one',
          skillIds: [],
          subtasks: [
            { title: 'Deep one', skillIds: [], subtasks: [] },
            { title: 'Deep two', skillIds: [DATA.id], subtasks: [] },
          ],
        },
      ],
    });
  });

  it('removes a subtask, renumbers its siblings and moves focus to the parent', async () => {
    stubApi({});
    renderApp('/tasks/new');
    const user = userEvent.setup();

    const add = await screen.findByRole('button', { name: 'Add subtask to Task 1' });
    await user.click(add);
    await user.click(add);
    await user.type(title('Subtask 1.2'), 'Keep me');

    await user.click(screen.getByRole('button', { name: 'Remove Subtask 1.1' }));

    expect(title('Subtask 1.1')).toHaveValue('Keep me');
    expect(screen.queryByRole('group', { name: 'Subtask 1.2' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add subtask to Task 1' })).toHaveFocus();
  });

  it('confirms before removing a subtask that has nested subtasks', async () => {
    stubApi({});
    renderApp('/tasks/new');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add subtask to Task 1' }));
    await user.click(screen.getByRole('button', { name: 'Add subtask to Subtask 1.1' }));
    await user.click(screen.getByRole('button', { name: 'Remove Subtask 1.1' }));

    const dialog = screen.getByRole('dialog', { name: 'Remove subtask 1.1?' });
    expect(dialog).toHaveTextContent('1 nested subtask.');
    await user.click(within(dialog).getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('group', { name: 'Subtask 1.1.1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Subtask 1.1' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('group', { name: 'Subtask 1.1' })).not.toBeInTheDocument();
  });

  it('flags every blank title on submit and focuses the first', async () => {
    const sent = stubApi({});
    renderApp('/tasks/new');
    const user = userEvent.setup();

    await user.type(await screen.findByRole('textbox'), 'Filled');
    await user.click(screen.getByRole('button', { name: 'Add subtask to Task 1' }));
    await user.click(screen.getByRole('button', { name: 'Add subtask to Task 1' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getAllByText('Enter a title.')).toHaveLength(2);
    expect(title('Subtask 1.1')).toHaveFocus();
    expect(title('Subtask 1.1')).toHaveAccessibleDescription('Enter a title.');
    expect(sent).toEqual([]);

    await user.type(title('Subtask 1.1'), 'Now filled');
    expect(screen.getAllByText('Enter a title.')).toHaveLength(1);
  });

  it('disables Save while submitting', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubApi({ 'POST /tasks': created() });
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') await gate;
      return original(url, init);
    }) as typeof fetch;

    renderApp('/tasks/new');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox'), 'A task');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
  });

  it('keeps the form and shows the error when saving fails', async () => {
    stubApi({
      'POST /tasks': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } },
      }),
    });
    renderApp('/tasks/new');
    const user = userEvent.setup();

    await user.type(await screen.findByRole('textbox'), 'Keep this text');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('textbox')).toHaveValue('Keep this text');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  describe('leaving the page', () => {
    it('leaves straight away when nothing was entered', async () => {
      stubApi({});
      const { router } = renderApp('/tasks/new');
      await screen.findByRole('textbox');
      await userEvent.click(screen.getByRole('link', { name: 'Back to tasks' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('asks before discarding, and honours both answers', async () => {
      stubApi({});
      const { router } = renderApp('/tasks/new');
      const user = userEvent.setup();
      await user.type(await screen.findByRole('textbox'), 'Unsaved');

      await user.click(screen.getByRole('link', { name: 'Back to tasks' }));
      const dialog = await screen.findByRole('dialog', { name: 'Discard this task?' });
      await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
      expect(router.state.location.pathname).toBe('/tasks/new');
      expect(screen.getByRole('textbox')).toHaveValue('Unsaved');

      await user.click(screen.getByRole('link', { name: 'Back to tasks' }));
      await user.click(await screen.findByRole('button', { name: 'Discard' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });
  });
});
