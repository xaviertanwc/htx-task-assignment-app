import { pino } from 'pino';
import { createApp } from './http/app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { openDatabase } from './db/database.js';
import { runSeed } from './db/seed.js';
import { createSkillRepository } from './features/skills/skill.repository.js';
import { createTaskRepository } from './features/tasks/task.repository.js';
import { startRetryPendingSkillsJob, type RetryJob } from './jobs/retryPendingSkills.js';
import { createGeminiSkillIdentifier } from './llm/gemini.js';
import { unconfiguredSkillIdentifier } from './llm/skillIdentifier.js';

function readConfig(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = readConfig();
const logger = pino({ level: config.LOG_LEVEL });
const database = await openDatabase(config.database, (message) => logger.debug(message));

const applied = await runMigrations(database.pool);
await runSeed(database.pool);
logger.info({ applied, databaseMode: config.database.mode }, 'Database ready');

if (!config.GEMINI_API_KEY) {
  logger.warn('GEMINI_API_KEY is not set: tasks created without skills will stay pending.');
}
const skillIdentifier = config.GEMINI_API_KEY
  ? createGeminiSkillIdentifier({
      apiKey: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
      baseUrl: config.GEMINI_BASE_URL,
    })
  : unconfiguredSkillIdentifier;

const server = createApp({
  pool: database.pool,
  skillIdentifier,
  logger,
  corsAllowedOrigins: config.CORS_ALLOWED_ORIGINS,
  rateLimit: { windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX },
  trustProxyHops: config.TRUST_PROXY_HOPS,
}).listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'Server listening');
});

const retryJob: RetryJob | undefined = config.GEMINI_API_KEY
  ? startRetryPendingSkillsJob(
      {
        tasks: createTaskRepository(database.pool),
        skills: createSkillRepository(database.pool),
        skillIdentifier,
        logger,
      },
      config.SKILL_RETRY_INTERVAL_MS,
    )
  : undefined;

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    Promise.resolve(retryJob?.stop())
      .then(() => database.close())
      .then(
        () => process.exit(0),
        (error: unknown) => {
          logger.error({ err: error }, 'Database did not close cleanly');
          process.exit(1);
        },
      );
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
