import type { HealthResponse } from '@le-uma/shared';
import type { FastifyPluginAsync } from 'fastify';

export type DbPing = () => Promise<unknown>;

declare const __APP_VERSION__: string | undefined;
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export const healthRoutes: FastifyPluginAsync<{ pingDb: DbPing }> = async (app, { pingDb }) => {
  app.get('/health', async (_req, reply) => {
    let db: HealthResponse['db'] = 'ok';
    try {
      await pingDb();
    } catch (err) {
      app.log.warn({ err }, 'database ping failed');
      db = 'down';
    }
    const body: HealthResponse = { status: 'ok', db, version };
    return reply.code(db === 'ok' ? 200 : 503).send(body);
  });
};
