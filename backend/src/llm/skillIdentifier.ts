/** The parts of a skill the LLM needs. */
export interface SkillOption {
  name: string;
  description: string;
}

/** Identifies the skills required by task titles. Implementations are swappable per LLM provider. */
export interface SkillIdentifier {
  /**
   * @returns one list of skill names per title, in the same order as `titles`. Every name is a
   *          name from `availableSkills`. An empty list means that title could not be identified.
   * @throws  SkillIdentificationError when no usable answer could be obtained at all.
   */
  identify(titles: string[], availableSkills: SkillOption[]): Promise<string[][]>;
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
