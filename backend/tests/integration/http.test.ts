import { readFileSync } from 'node:fs';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type AppDependencies } from '../../src/http/app.js';
import { openApiDocument } from '../../src/http/openapi.js';

function appWith(overrides: Partial<AppDependencies> = {}) {
  return createApp({
    pool: { query: () => Promise.reject(new Error('database down')) } as never,
    skillIdentifier: { identify: async () => [] },
    logger: pino({ level: 'silent' }),
    corsAllowedOrigins: [],
    rateLimit: { windowMs: 60_000, max: 1000 },
    trustProxyHops: 0,
    ...overrides,
  });
}

describe('health', () => {
  it('reports 503 when the database is unreachable', async () => {
    const res = await request(appWith()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
  });
});

describe('CORS', () => {
  it('sends no CORS headers by default', async () => {
    const res = await request(appWith())
      .get('/api/v1/openapi.json')
      .set('Origin', 'http://evil.test');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows only configured origins', async () => {
    const app = appWith({ corsAllowedOrigins: ['http://app.test'] });
    const allowed = await request(app).get('/api/v1/openapi.json').set('Origin', 'http://app.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://app.test');
    const denied = await request(app).get('/api/v1/openapi.json').set('Origin', 'http://evil.test');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('returns the standard error shape once the limit is reached', async () => {
    const app = appWith({ rateLimit: { windowMs: 60_000, max: 1 } });
    await request(app).get('/api/v1/openapi.json').expect(200);
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not limit the health check, which Docker polls', async () => {
    const app = appWith({ rateLimit: { windowMs: 60_000, max: 1 } });
    await request(app).get('/health');
    expect((await request(app).get('/health')).status).toBe(503);
  });
});

describe('API docs', () => {
  it('serves Swagger UI', async () => {
    const res = await request(appWith()).get('/api/v1/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('describes recursive tasks with references that resolve', () => {
    const { schemas } = openApiDocument.components;
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(['Task', 'TaskInput', 'TaskUpdate', 'Developer', 'Skill']),
    );
    const refs = [
      ...JSON.stringify(openApiDocument).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g),
    ];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, name] of refs) expect(schemas).toHaveProperty(name!);
  });

  it('has a committed copy that is up to date', () => {
    const committed = JSON.parse(readFileSync('openapi.json', 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(openApiDocument)));
  });
});
