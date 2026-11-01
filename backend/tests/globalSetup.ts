import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** Uses TEST_DATABASE_URL when set (e.g. CI), otherwise boots a real, temporary Postgres. */
export default async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    project.provide('databaseUrl', process.env.TEST_DATABASE_URL);
    return;
  }
  const databaseDir = await mkdtemp(path.join(tmpdir(), 'task-assignment-test-'));
  const port = await findFreePort();
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('task_assignment_test');
  project.provide(
    'databaseUrl',
    `postgres://postgres:postgres@localhost:${port}/task_assignment_test`,
  );

  return async () => {
    await postgres.stop();
    await rm(databaseDir, { recursive: true, force: true });
  };
}
