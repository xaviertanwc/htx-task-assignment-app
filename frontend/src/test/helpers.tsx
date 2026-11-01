import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { routes } from '../app/routes';
import type { Developer, Skill, Task } from '../shared/api/types';
import { ToastProvider } from '../shared/ui/Toast';

// Deliberately not the seeded names: the UI must not depend on any particular skill.
export const DESIGN: Skill = { id: 1, name: 'Design', description: '' };
export const DATA: Skill = { id: 2, name: 'Data', description: '' };

export const DEVELOPERS: Developer[] = [
  { id: 1, name: 'Alice', skills: [DESIGN], tasks: [] },
  { id: 2, name: 'Bob', skills: [DATA], tasks: [] },
  { id: 3, name: 'Carol', skills: [DESIGN, DATA], tasks: [] },
];

export function makeTask(overrides: Partial<Task> & { id: number; title: string }): Task {
  return {
    status: 'To-do',
    parentTaskId: null,
    assignee: null,
    skills: [DESIGN],
    skillsSource: 'user',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  };
}

export type Route = (body: unknown) => { status?: number; body: unknown };

const ok = (data: unknown) => () => ({ body: { data } });

/** Stubs `fetch` with `"METHOD /path"` handlers (under /api/v1) and records calls with a body. */
export function stubApi(routeHandlers: Record<string, Route>, tasks: Task[] = []) {
  const handlers: Record<string, Route> = {
    'GET /skills': ok([DESIGN, DATA]),
    'GET /developers': ok(DEVELOPERS),
    'GET /tasks': ok(tasks),
    ...routeHandlers,
  };
  const sent: { route: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const route = `${init?.method ?? 'GET'} ${url.replace('/api/v1', '')}`;
      const handler = handlers[route];
      if (!handler) throw new Error(`Unexpected request: ${route}`);
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      if (init?.body) sent.push({ route, body });
      const result = handler(body);
      return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
    }),
  );
  return sent;
}

export const respondWith = ok;

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, router };
}
