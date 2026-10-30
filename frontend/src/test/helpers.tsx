import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from '../App';
import type { Developer, Skill, Task } from '../api/types';

export const FRONTEND: Skill = { id: 1, name: 'Frontend' };
export const BACKEND: Skill = { id: 2, name: 'Backend' };

export const DEVELOPERS: Developer[] = [
  { id: 1, name: 'Alice', skills: [FRONTEND] },
  { id: 2, name: 'Bob', skills: [BACKEND] },
  { id: 3, name: 'Carol', skills: [FRONTEND, BACKEND] },
  { id: 4, name: 'Dave', skills: [BACKEND] },
];

export function makeTask(overrides: Partial<Task> & { id: number; title: string }): Task {
  return {
    status: 'To-do',
    parentTaskId: null,
    assignee: null,
    skills: [FRONTEND],
    skillsSource: 'user',
    subtasks: [],
    ...overrides,
  };
}

export type Route = (body: unknown) => { status?: number; body: unknown };

/** Stubs `fetch` with `"METHOD /path"` handlers and records every call that carries a body. */
export function stubApi(routes: Record<string, Route>) {
  const sent: { route: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const route = `${init?.method ?? 'GET'} ${url}`;
      const handler = routes[route];
      if (!handler) throw new Error(`Unexpected request: ${route}`);
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      if (init?.body) sent.push({ route, body });
      const result = handler(body);
      return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
    }),
  );
  return sent;
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
