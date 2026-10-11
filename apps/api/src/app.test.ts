import { healthResponseSchema } from '@lmu/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = {
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'error' as const,
  SESSION_SECRET: 'x'.repeat(32),
  APP_URL: 'http://localhost:5173',
};

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const app = await buildApp({ config, pingDb: async () => 1, logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json()).db).toBe('ok');
    await app.close();
  });

  it('returns 503 when the database is down', async () => {
    const app = await buildApp({
      config,
      pingDb: async () => {
        throw new Error('connection refused');
      },
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().db).toBe('down');
    await app.close();
  });
});

describe('cross-origin protection', () => {
  it('rejects state-changing requests from other origins', async () => {
    const app = await buildApp({ config, pingDb: async () => 1, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('config', () => {
  it('rejects a short session secret', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://u:p@localhost/db', SESSION_SECRET: 'short' }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('treats empty Discord values as not set', () => {
    const c = loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost/db',
      SESSION_SECRET: 'x'.repeat(32),
      DISCORD_CLIENT_ID: '',
      RUN_MIGRATIONS: 'true',
    });
    expect(c.DISCORD_CLIENT_ID).toBeUndefined();
    expect(c.RUN_MIGRATIONS).toBe(true);
  });
});
