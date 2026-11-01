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

interface ErrorBody {
  error?: { message?: string; code?: string };
}

/** Calls the API and unwraps its `{ data }` envelope, or throws an ApiError with its message. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ErrorBody | null)?.error;
    throw new ApiError(
      error?.message ?? `The request failed (HTTP ${response.status}).`,
      response.status,
      error?.code,
    );
  }
  return (body as { data: T }).data;
}
