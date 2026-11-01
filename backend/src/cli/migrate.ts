import { runMigrations } from '../db/migrate.js';
import { runDatabaseCommand } from './run.js';

await runDatabaseCommand(async (pool) => {
  const applied = await runMigrations(pool);
  console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Already up to date.');
});
