import { runSeed } from '../db/seed.js';
import { runDatabaseCommand } from './run.js';

await runDatabaseCommand(async (pool) => {
  await runSeed(pool);
  console.log('Seed complete.');
});
