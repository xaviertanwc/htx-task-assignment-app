import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { createGeminiSkillIdentifier } from './llm/geminiSkillIdentifier.js';
import { unconfiguredSkillIdentifier } from './llm/skillIdentifier.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const db = createPool(config.DATABASE_URL);

const applied = await runMigrations(db);
logger.info({ applied }, 'Database migrations complete');

if (!config.GEMINI_API_KEY) {
  logger.warn('GEMINI_API_KEY is not set: tasks created without skills will be rejected.');
}
const skillIdentifier = config.GEMINI_API_KEY
  ? createGeminiSkillIdentifier({
      apiKey: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
      baseUrl: config.GEMINI_BASE_URL,
    })
  : unconfiguredSkillIdentifier;

const server = createApp({ db, skillIdentifier, logger }).listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'Server listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void db.end().then(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
