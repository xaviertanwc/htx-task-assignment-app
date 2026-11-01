import { z } from 'zod';

export const skillSchema = z
  .object({ id: z.number().int(), name: z.string(), description: z.string() })
  .meta({ id: 'Skill' });
