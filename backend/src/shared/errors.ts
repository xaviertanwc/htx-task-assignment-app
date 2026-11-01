/** Why a request failed, in domain terms. The HTTP layer decides how each kind is reported. */
export type ErrorKind = 'invalid' | 'not_found' | 'conflict' | 'unprocessable' | 'rate_limited';

export class AppError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (resource: string, id: number) =>
  new AppError(
    'not_found',
    `${resource.toUpperCase()}_NOT_FOUND`,
    `${resource} ${id} was not found.`,
  );
