import { loadConfig } from '../config/env.js';
import { openDatabase, type Pool } from '../db/database.js';

/** Runs one database command against the configured database, then shuts it down. */
export async function runDatabaseCommand(command: (pool: Pool) => Promise<void>): Promise<void> {
  const database = await openDatabase(loadConfig().database);
  try {
    await command(database.pool);
  } finally {
    await database.close();
  }
}
