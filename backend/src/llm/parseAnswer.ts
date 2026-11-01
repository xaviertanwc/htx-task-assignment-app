import { z } from 'zod';

const answerSchema = z.array(z.object({ index: z.number().int(), skills: z.array(z.string()) }));

/**
 * Validates the model's raw text against the known skills. Throws if the text is unusable as a
 * whole. A title with no valid skills gets an empty list, so one bad answer cannot sink the rest.
 */
export function parseAnswer(
  text: string | undefined,
  titleCount: number,
  availableSkills: string[],
): string[][] {
  const answer = answerSchema.parse(JSON.parse(text ?? ''));
  return Array.from({ length: titleCount }, (_, index) => {
    const skills = answer.find((item) => item.index === index)?.skills ?? [];
    return [...new Set(skills)].filter((skill) => availableSkills.includes(skill));
  });
}
