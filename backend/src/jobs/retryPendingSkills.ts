import type { Logger } from 'pino';
import type { SkillRepository } from '../features/skills/skill.repository.js';
import { resolveSkillIds } from '../features/tasks/skill.resolution.js';
import type { TaskRepository } from '../features/tasks/task.repository.js';
import type { SkillIdentifier } from '../llm/skillIdentifier.js';

const BATCH_SIZE = 20;

export interface RetryJobDependencies {
  tasks: Pick<TaskRepository, 'findPendingSkills' | 'resolvePendingSkills'>;
  skills: Pick<SkillRepository, 'findAll'>;
  skillIdentifier: SkillIdentifier;
  logger: Pick<Logger, 'warn' | 'info' | 'error'>;
}

/** Identifies skills for one batch of pending tasks and returns how many were resolved. */
export async function retryPendingSkillsOnce(deps: RetryJobDependencies): Promise<number> {
  const pending = await deps.tasks.findPendingSkills(BATCH_SIZE);
  if (pending.length === 0) return 0;

  // No transaction spans this call, so a slow LLM never holds a connection or a row lock.
  const skillIds = await resolveSkillIds(
    deps.skillIdentifier,
    pending.map((task) => task.title),
    await deps.skills.findAll(),
    deps.logger,
  );

  let resolved = 0;
  for (const [index, task] of pending.entries()) {
    const ids = skillIds[index]!;
    if (ids.length > 0 && (await deps.tasks.resolvePendingSkills(task.id, ids))) resolved++;
  }
  if (resolved > 0) deps.logger.info({ resolved }, 'Resolved pending task skills');
  return resolved;
}

export interface RetryJob {
  /** Stops scheduling and waits for any run in progress. */
  stop(): Promise<void>;
}

export function startRetryPendingSkillsJob(
  deps: RetryJobDependencies,
  intervalMs: number,
): RetryJob {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let running: Promise<void> = Promise.resolve();

  const schedule = () => {
    if (stopped) return;
    // A chained timeout rather than setInterval, so a slow run can never overlap the next.
    timer = setTimeout(() => {
      running = retryPendingSkillsOnce(deps)
        .then(
          () => undefined,
          (error: unknown) => deps.logger.error({ err: error }, 'Skill retry job failed'),
        )
        .finally(schedule);
    }, intervalMs);
  };
  schedule();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
