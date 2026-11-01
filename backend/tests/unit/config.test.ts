import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

function problemsFor(env: NodeJS.ProcessEnv): string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error('Expected the configuration to be rejected.');
}

describe('loadConfig', () => {
  it('defaults to embedded mode with no settings at all', () => {
    expect(loadConfig({}).database).toMatchObject({ mode: 'embedded', port: 55432 });
  });

  it('accepts external mode with a URL', () => {
    const { database } = loadConfig({
      DB_MODE: 'external',
      DATABASE_URL: 'postgres://u:p@db:5432/app',
    });
    expect(database).toEqual({ mode: 'external', url: 'postgres://u:p@db:5432/app' });
  });

  it('treats empty strings as unset, as Compose passes them', () => {
    expect(loadConfig({ DB_MODE: '', GEMINI_MODEL: '' }).database.mode).toBe('embedded');
  });

  it('explains a missing or malformed DATABASE_URL by name', () => {
    expect(problemsFor({ DB_MODE: 'external' })).toEqual([
      'DATABASE_URL is required when DB_MODE=external',
    ]);
    expect(problemsFor({ DB_MODE: 'external', DATABASE_URL: 'mysql://x' })).toEqual([
      'DATABASE_URL must be a postgres:// or postgresql:// URL',
    ]);
  });

  it('rejects an unknown mode and reports every problem at once', () => {
    const problems = problemsFor({ DB_MODE: 'sqlite', PORT: 'abc' });
    expect(problems).toHaveLength(2);
    expect(problems.join()).toContain('DB_MODE must be "embedded" or "external"');
    expect(problems.join()).toContain('PORT');
  });

  it('never echoes values, which may be secrets', () => {
    const secret = 'mysql://user:s3cret@host/db';
    const error = problemsFor({ DB_MODE: 'external', DATABASE_URL: secret }).join();
    expect(error).not.toContain('s3cret');
  });

  it('splits CORS origins', () => {
    expect(loadConfig({ CORS_ALLOWED_ORIGINS: 'http://a.test, http://b.test' })).toMatchObject({
      CORS_ALLOWED_ORIGINS: ['http://a.test', 'http://b.test'],
    });
  });
});
