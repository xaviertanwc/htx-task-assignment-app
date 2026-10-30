export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export const notFound = (resource: string, id: number) =>
  new AppError(404, `${resource.toUpperCase()}_NOT_FOUND`, `${resource} ${id} was not found.`);
