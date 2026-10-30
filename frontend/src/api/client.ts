import type { Developer, NewTask, Skill, Task, TaskUpdate } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(
      error?.message ?? `The request failed (HTTP ${response.status}).`,
      response.status,
      error?.code,
    );
  }
  return body as T;
}

export const api = {
  listTasks: () => request<Task[]>('/tasks'),
  createTask: (task: NewTask) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(task) }),
  updateTask: (id: number, update: TaskUpdate) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(update) }),
  listDevelopers: () => request<Developer[]>('/developers'),
  listSkills: () => request<Skill[]>('/skills'),
};
