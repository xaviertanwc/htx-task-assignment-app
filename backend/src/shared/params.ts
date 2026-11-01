import { z } from 'zod';
import { AppError } from './errors.js';

// Upper bound is Postgres INT; larger values would otherwise surface as a database error.
export const idSchema = z.number().int().positive().max(2_147_483_647);

export function parseIdParam(value: unknown): number {
  const parsed = z.coerce.number().pipe(idSchema).safeParse(value);
  if (!parsed.success)
    throw new AppError('invalid', 'INVALID_ID', 'The id must be a positive integer.');
  return parsed.data;
}
