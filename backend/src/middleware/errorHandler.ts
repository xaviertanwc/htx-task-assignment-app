import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof AppError) {
    if (error.status >= 500) req.log?.error({ err: error }, error.message);
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        details: error.issues.map(({ path, message }) => ({ path, message })),
      },
    });
    return;
  }
  // Errors raised by body-parser (malformed JSON, payload too large) carry a 4xx status.
  const status = (error as { status?: number }).status;
  if (status !== undefined && status >= 400 && status < 500) {
    res.status(status).json({
      error: { code: 'BAD_REQUEST', message: 'The request body could not be read.' },
    });
    return;
  }
  req.log?.error({ err: error }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' },
  });
};
