/** Identifies the skills required by task titles. Implementations are swappable per LLM provider. */
export interface SkillIdentifier {
  /**
   * @returns one non-empty list of skill names per title, in the same order as `titles`.
   *          Every name is drawn from `availableSkills`.
   * @throws  SkillIdentificationError when no valid answer could be obtained.
   */
  identify(titles: string[], availableSkills: string[]): Promise<string[][]>;
}

export class SkillIdentificationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SkillIdentificationError';
  }
}

export const unconfiguredSkillIdentifier: SkillIdentifier = {
  identify: () => Promise.reject(new SkillIdentificationError('GEMINI_API_KEY is not configured.')),
};
