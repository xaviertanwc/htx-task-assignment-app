import { describe, expect, it, vi } from 'vitest';
import {
  retryPendingSkillsOnce,
  startRetryPendingSkillsJob,
  type RetryJobDependencies,
} from '../../src/jobs/retryPendingSkills.js';
import { SkillIdentificationError } from '../../src/llm/skillIdentifier.js';

const SKILL = { id: 1, name: 'Design', description: 'Visual work' };

function dependencies(
  pending: { id: number; title: string }[],
  identify: RetryJobDependencies['skillIdentifier']['identify'],
) {
  const resolvePendingSkills = vi.fn(async () => true);
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const deps = {
    tasks: { findPendingSkills: async () => pending, resolvePendingSkills },
    skills: { findAll: async () => [SKILL] },
    skillIdentifier: { identify },
    logger: logger as never,
  } satisfies RetryJobDependencies;
  return { deps, resolvePendingSkills, logger };
}

describe('retryPendingSkillsOnce', () => {
  it('does not call the LLM when nothing is pending', async () => {
    const identify = vi.fn(async () => []);
    const { deps } = dependencies([], identify);
    await expect(retryPendingSkillsOnce(deps)).resolves.toBe(0);
    expect(identify).not.toHaveBeenCalled();
  });

  it('resolves what it can and leaves the rest pending', async () => {
    const { deps, resolvePendingSkills } = dependencies(
      [
        { id: 1, title: 'Clear' },
        { id: 2, title: 'Unclear' },
      ],
      async () => [['Design'], []],
    );
    await expect(retryPendingSkillsOnce(deps)).resolves.toBe(1);
    expect(resolvePendingSkills).toHaveBeenCalledExactlyOnceWith(1, [SKILL.id]);
  });

  it('survives an LLM outage', async () => {
    const { deps, resolvePendingSkills } = dependencies([{ id: 1, title: 'x' }], () =>
      Promise.reject(new SkillIdentificationError('down')),
    );
    await expect(retryPendingSkillsOnce(deps)).resolves.toBe(0);
    expect(resolvePendingSkills).not.toHaveBeenCalled();
  });
});

describe('startRetryPendingSkillsJob', () => {
  it('keeps running after a failed run and stops cleanly', async () => {
    const findPendingSkills = vi
      .fn<RetryJobDependencies['tasks']['findPendingSkills']>()
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValue([]);
    const { deps, logger } = dependencies([], async () => []);
    const job = startRetryPendingSkillsJob(
      { ...deps, tasks: { ...deps.tasks, findPendingSkills } },
      1,
    );
    await vi.waitFor(() => expect(findPendingSkills.mock.calls.length).toBeGreaterThan(1));
    await job.stop();

    const callsAtStop = findPendingSkills.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(findPendingSkills.mock.calls.length).toBe(callsAtStop);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
