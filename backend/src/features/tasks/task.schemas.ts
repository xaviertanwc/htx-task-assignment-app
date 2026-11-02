import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { idSchema } from '../../shared/params.js';
import { skillSummarySchema } from '../../shared/responses.js';

export const TASK_STATUSES = ['To-do', 'In Progress', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusSchema = z.enum(TASK_STATUSES).meta({ id: 'TaskStatus' });

export const MAX_TASKS_PER_REQUEST = 100;
export const MAX_NESTING_DEPTH = 10;

export const taskInputSchema = z
  .strictObject({
    title: z.string().trim().min(1, 'Title is required.').max(500),
    skillIds: z.array(idSchema).default([]).meta({
      description: 'Leave empty to have the skills identified automatically.',
    }),
    get subtasks() {
      return z.array(taskInputSchema).default([]);
    },
  })
  .meta({ id: 'TaskInput' });

export type TaskInput = z.infer<typeof taskInputSchema>;

/**
 * Bounds the tree iteratively before the recursive schema walks it, so a deeply nested
 * payload is rejected with a clear error rather than exhausting the stack.
 */
function assertTreeWithinLimits(body: unknown): void {
  const pending: { node: unknown; depth: number }[] = [{ node: body, depth: 1 }];
  let count = 0;
  while (pending.length > 0) {
    const { node, depth } = pending.pop()!;
    count++;
    if (count > MAX_TASKS_PER_REQUEST || depth > MAX_NESTING_DEPTH) {
      throw new AppError(
        'invalid',
        'TASK_TREE_TOO_LARGE',
        `A request can hold at most ${MAX_TASKS_PER_REQUEST} tasks nested ${MAX_NESTING_DEPTH} levels deep.`,
      );
    }
    const subtasks = (node as { subtasks?: unknown } | null)?.subtasks;
    if (Array.isArray(subtasks)) {
      subtasks.forEach((child) => pending.push({ node: child, depth: depth + 1 }));
    }
  }
}

export function parseCreateTask(body: unknown): TaskInput {
  assertTreeWithinLimits(body);
  return taskInputSchema.parse(body);
}

export const updateTaskSchema = z
  .strictObject({
    status: taskStatusSchema.optional().meta({
      description:
        'Moving forward (To-do → In Progress → Done) requires an assignee, which may be set in the same request. Moving backwards does not.',
    }),
    assigneeId: idSchema.nullable().optional(),
  })
  .refine((body) => body.status !== undefined || body.assigneeId !== undefined, {
    message: 'Provide status and/or assigneeId.',
  })
  .meta({ id: 'TaskUpdate' });

export type TaskUpdate = z.infer<typeof updateTaskSchema>;

export const parseUpdateTask = (body: unknown): TaskUpdate => updateTaskSchema.parse(body);

export const taskSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    status: taskStatusSchema,
    parentTaskId: z.number().int().nullable(),
    assignee: z.object({ id: z.number().int(), name: z.string() }).nullable(),
    skills: z.array(skillSummarySchema),
    skillsSource: z.enum(['user', 'llm', 'pending']).meta({
      description:
        '"pending" means skills are still being identified; the task cannot be assigned until they are.',
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    get subtasks() {
      return z.array(taskSchema);
    },
  })
  .meta({ id: 'Task' });
