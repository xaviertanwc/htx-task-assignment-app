import { z } from 'zod';

const embeddedDatabase = z.object({
  DB_MODE: z.literal('embedded'),
  DB_EMBEDDED_DATA_DIR: z.string().min(1).default('.data/postgres'),
  DB_EMBEDDED_PORT: z.coerce.number().int().min(1).max(65535).default(55432),
  DB_EMBEDDED_USER: z.string().min(1).default('postgres'),
  DB_EMBEDDED_PASSWORD: z.string().min(1).default('postgres'),
  DB_EMBEDDED_NAME: z.string().min(1).default('task_assignment'),
});

const externalDatabase = z.object({
  DB_MODE: z.literal('external'),
  DATABASE_URL: z
    .string({ error: 'is required when DB_MODE=external' })
    .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres:// or postgresql:// URL'),
});

const databaseEnv = z.discriminatedUnion('DB_MODE', [embeddedDatabase, externalDatabase], {
  error: 'must be "embedded" or "external"',
});

const appEnv = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_BASE_URL: z.url().optional(),
  SKILL_RETRY_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
});

export type DatabaseConfig =
  | {
      mode: 'embedded';
      dataDir: string;
      port: number;
      user: string;
      password: string;
      name: string;
    }
  | { mode: 'external'; url: string };

export type Config = z.output<typeof appEnv> & { database: DatabaseConfig };

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

function describeIssues(error: z.ZodError): string[] {
  // Reports the variable and the rule only: values may be secrets and must never be echoed.
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
}

function toDatabaseConfig(env: z.output<typeof databaseEnv>): DatabaseConfig {
  if (env.DB_MODE === 'external') return { mode: 'external', url: env.DATABASE_URL };
  return {
    mode: 'embedded',
    dataDir: env.DB_EMBEDDED_DATA_DIR,
    port: env.DB_EMBEDDED_PORT,
    user: env.DB_EMBEDDED_USER,
    password: env.DB_EMBEDDED_PASSWORD,
    name: env.DB_EMBEDDED_NAME,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Compose passes unset variables through as empty strings; treat those as unset.
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));

  const app = appEnv.safeParse(defined);
  const database = databaseEnv.safeParse({ DB_MODE: 'embedded', ...defined });
  const problems = [
    ...(app.success ? [] : describeIssues(app.error)),
    ...(database.success ? [] : describeIssues(database.error)),
  ];
  if (!app.success || !database.success) throw new ConfigError(problems);

  return { ...app.data, database: toDatabaseConfig(database.data) };
}
