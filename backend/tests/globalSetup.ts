import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { startEmbeddedPostgres } from '../src/db/embedded.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** Uses TEST_DATABASE_URL when set (e.g. a real server), otherwise boots an embedded Postgres. */
export default async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    project.provide('databaseUrl', process.env.TEST_DATABASE_URL);
    return;
  }
  const dataDir = await mkdtemp(path.join(tmpdir(), 'task-assignment-test-'));
  const instance = await startEmbeddedPostgres({
    dataDir,
    port: await findFreePort(),
    user: 'postgres',
    password: 'postgres',
    name: 'task_assignment_test',
    persistent: false,
  });
  project.provide('databaseUrl', instance.url);

  return async () => {
    await instance.stop();
    await rm(dataDir, { recursive: true, force: true });
  };
}
