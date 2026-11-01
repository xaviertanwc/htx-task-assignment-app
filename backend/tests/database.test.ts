import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { runSeed } from '../src/db/seed.js';
import { findFreePort } from './globalSetup.js';

const SEEDED = `
  SELECT d.name, array_agg(s.name ORDER BY s.id) AS skills
  FROM developers d
  JOIN developer_skills ds ON ds.developer_id = d.id
  JOIN skills s ON s.id = ds.skill_id
  GROUP BY d.id, d.name
  ORDER BY d.id
`;

describe('openDatabase', () => {
  it('connects to a server in external mode and closes the pool', async () => {
    const database = await openDatabase({ mode: 'external', url: inject('databaseUrl') });
    await expect(database.pool.query('SELECT 1 AS one')).resolves.toMatchObject({
      rows: [{ one: 1 }],
    });
    await database.close();
    expect(database.pool.ended).toBe(true);
  });

  it('keeps data and stays idempotent across embedded restarts', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'task-assignment-restart-'));
    const config = {
      mode: 'embedded' as const,
      dataDir,
      port: await findFreePort(),
      user: 'postgres',
      password: 'p@ss/word',
      name: 'restart_test',
    };
    try {
      const first = await openDatabase(config);
      expect(await runMigrations(first.pool)).not.toEqual([]);
      await runSeed(first.pool);
      await first.close();

      const second = await openDatabase(config);
      expect(await runMigrations(second.pool)).toEqual([]);
      await runSeed(second.pool);
      const { rows } = await second.pool.query(SEEDED);
      expect(rows).toEqual([
        { name: 'Alice', skills: ['Frontend'] },
        { name: 'Bob', skills: ['Backend'] },
        { name: 'Carol', skills: ['Frontend', 'Backend'] },
        { name: 'Dave', skills: ['Backend'] },
      ]);
      await second.close();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);
});
