import { z } from 'zod';
import { AppError } from '../errors.js';
import { idSchema } from './params.js';

export const TASK_STATUSES = ['To-do', 'In Progress', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const MAX_TASKS_PER_REQUEST = 100;
export const MAX_NESTING_DEPTH = 10;

const taskInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Title is required.').max(500),
  skillIds: z.array(idSchema).default([]),
  get subtasks() {
    return z.array(taskInputSchema).default([]);
  },
});

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
        400,
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

const updateTaskSchema = z
  .strictObject({
    status: z.enum(TASK_STATUSES).optional(),
    assigneeId: idSchema.nullable().optional(),
  })
  .refine((body) => body.status !== undefined || body.assigneeId !== undefined, {
    message: 'Provide status and/or assigneeId.',
  });

export type TaskUpdate = z.infer<typeof updateTaskSchema>;

export const parseUpdateTask = (body: unknown): TaskUpdate => updateTaskSchema.parse(body);
