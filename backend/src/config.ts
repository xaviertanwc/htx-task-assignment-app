import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  // Optional so the app still runs without a key; only tasks that need the LLM are affected.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_BASE_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Compose passes unset variables through as empty strings; treat those as unset.
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  return envSchema.parse(defined);
}
