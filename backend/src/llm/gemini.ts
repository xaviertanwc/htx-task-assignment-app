import { GoogleGenAI, Type } from '@google/genai';
import { parseAnswer } from './parseAnswer.js';
import { buildUserContent, SYSTEM_INSTRUCTION } from './prompt.js';
import { SkillIdentificationError, type SkillIdentifier } from './skillIdentifier.js';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  backoffMs?: number;
}

export function createGeminiSkillIdentifier(options: GeminiOptions): SkillIdentifier {
  const { apiKey, model, baseUrl, backoffMs = BASE_BACKOFF_MS } = options;
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS, ...(baseUrl ? { baseUrl } : {}) },
  });

  return {
    async identify(titles, skills) {
      const skillNames = skills.map((skill) => skill.name);

      let lastError: unknown;
      let partialAnswer: string[][] | undefined;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: buildUserContent(titles, skills),
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              temperature: 0,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ['index', 'skills'],
                  properties: {
                    index: { type: Type.INTEGER },
                    skills: {
                      type: Type.ARRAY,
                      minItems: '1',
                      items: { type: Type.STRING, enum: skillNames },
                    },
                  },
                },
              },
            },
          });
          const answer = parseAnswer(response.text, titles.length, skillNames);
          if (answer.every((skillsOfTitle) => skillsOfTitle.length > 0)) return answer;
          partialAnswer = answer;
        } catch (error) {
          lastError = error;
        }
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
        }
      }
      if (partialAnswer) return partialAnswer;
      throw new SkillIdentificationError('Gemini did not return a usable answer.', {
        cause: lastError,
      });
    },
  };
}
