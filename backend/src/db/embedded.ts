import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export interface EmbeddedOptions {
  dataDir: string;
  port: number;
  user: string;
  password: string;
  name: string;
  persistent?: boolean;
  onLog?: (message: string) => void;
}

export interface EmbeddedInstance {
  url: string;
  stop(): Promise<void>;
}

/** Starts a Postgres process, initialising its data directory and database on first use. */
export async function startEmbeddedPostgres(options: EmbeddedOptions): Promise<EmbeddedInstance> {
  const { port, user, password, name, persistent = true, onLog = () => {} } = options;
  const databaseDir = path.resolve(options.dataDir);
  mkdirSync(databaseDir, { recursive: true });

  const postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user,
    password,
    persistent,
    onLog,
    onError: (message) => onLog(String(message)),
  });

  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await postgres.initialise();
  await postgres.start();

  const admin = postgres.getPgClient();
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) await postgres.createDatabase(name);
  } finally {
    await admin.end();
  }

  const url = new URL(`postgres://localhost:${port}/${encodeURIComponent(name)}`);
  url.username = user;
  url.password = password;
  return { url: url.toString(), stop: () => postgres.stop() };
}
