import { z } from 'zod';

export const skillSummarySchema = z.object({ id: z.number().int(), name: z.string() }).meta({
  id: 'SkillSummary',
});

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ description: 'Stable, machine-readable error code.' }),
      message: z.string().meta({ description: 'Readable explanation, safe to show to users.' }),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorResponse' });
