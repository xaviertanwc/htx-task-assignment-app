import type { Logger } from 'pino';
import { SkillIdentificationError, type SkillIdentifier } from '../../llm/skillIdentifier.js';
import type { Skill } from '../skills/skill.repository.js';

export type WarningLogger = Pick<Logger, 'warn'>;

/**
 * Asks the LLM for each title's skill ids. Never fails for an LLM problem: a title it could not
 * resolve gets an empty list, which callers record as pending.
 */
export async function resolveSkillIds(
  skillIdentifier: SkillIdentifier,
  titles: string[],
  catalogue: Skill[],
  logger: WarningLogger,
): Promise<number[][]> {
  let answers: string[][];
  try {
    answers = await skillIdentifier.identify(titles, catalogue);
  } catch (error) {
    if (!(error instanceof SkillIdentificationError)) throw error;
    logger.warn({ err: error, taskCount: titles.length }, 'Skill identification failed');
    return titles.map(() => []);
  }

  const idByName = new Map(catalogue.map((skill) => [skill.name, skill.id]));
  return titles.map((_, index) =>
    (answers[index] ?? []).flatMap((name) => idByName.get(name) ?? []),
  );
}
