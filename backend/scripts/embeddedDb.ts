// Runs a throwaway-friendly local Postgres without Docker: `npm run db:embedded`.
import path from 'node:path';
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const databaseDir = path.resolve(import.meta.dirname, '../.dev-pgdata');
const port = Number(process.env.DB_PORT ?? 5432);
const isNew = !existsSync(path.join(databaseDir, 'PG_VERSION'));

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
});

if (isNew) await postgres.initialise();
await postgres.start();
if (isNew) await postgres.createDatabase('task_assignment');
console.log(`DATABASE_URL=postgres://postgres:postgres@localhost:${port}/task_assignment`);

const stop = () => void postgres.stop().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
