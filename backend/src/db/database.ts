import pg from 'pg';
import type { DatabaseConfig } from '../config/env.js';

export type Pool = pg.Pool;
/** Either the pool or a client inside a transaction; both expose `query`. */
export type Queryable = Pick<pg.Pool, 'query'>;

export interface Database {
  pool: Pool;
  /** Drains the pool, then stops the database process if this module started one. */
  close(): Promise<void>;
}

const CONNECTION_TIMEOUT_MS = 5_000;

function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
}

/** The only place that knows which database mode is in use. */
export async function openDatabase(
  config: DatabaseConfig,
  onLog?: (message: string) => void,
): Promise<Database> {
  if (config.mode === 'external') {
    const pool = createPool(config.url);
    return { pool, close: () => pool.end() };
  }

  // Loaded on demand so external mode never touches the embedded binaries.
  const { startEmbeddedPostgres } = await import('./embedded.js');
  const instance = await startEmbeddedPostgres({ ...config, onLog });
  const pool = createPool(instance.url);
  return {
    pool,
    async close() {
      await pool.end();
      await instance.stop();
    },
  };
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
