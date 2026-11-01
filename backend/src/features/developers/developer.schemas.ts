import { z } from 'zod';
import { skillSummarySchema } from '../../shared/responses.js';
import { taskStatusSchema } from '../tasks/task.schemas.js';

export const developerSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    skills: z.array(skillSummarySchema),
    tasks: z.array(z.object({ id: z.number().int(), title: z.string(), status: taskStatusSchema })),
  })
  .meta({ id: 'Developer' });
