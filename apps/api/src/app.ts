import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { DiscordClient } from './auth/discord';
import type { Config } from './config';
import type { Db } from './db/client';
import { authRoutes } from './routes/auth';
import { healthRoutes, type DbPing } from './routes/health';
import { meRoutes } from './routes/me';

export interface AppDeps {
  config: Pick<Config, 'NODE_ENV' | 'LOG_LEVEL' | 'SESSION_SECRET' | 'APP_URL'>;
  /** Resolves when the database answers; rejects when it doesn't. */
  pingDb: DbPing;
  /** Needed for login and everything behind it; tests of health checks can leave it out. */
  db?: Db;
  /** null (or omitted) when Discord credentials aren't configured. */
  discord?: DiscordClient | null;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ config, pingDb, db, discord = null, logger }: AppDeps) {
  const app = Fastify({
    logger: logger ?? {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
      }),
    },
    // Behind Caddy in production; trust its X-Forwarded-* headers.
    trustProxy: config.NODE_ENV === 'production',
  });

  // The API serves JSON only; the SPA's CSP is set by Caddy.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // Reject cross-site state-changing requests (CSRF), on top of SameSite=Lax cookies.
  const allowedOrigin = new URL(config.APP_URL).origin;
  app.addHook('onRequest', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && origin !== allowedOrigin) {
      return reply.code(403).send({ error: 'Cross-origin request rejected' });
    }
  });

  app.decorateRequest('user', null);

  await app.register(healthRoutes, { prefix: '/api', pingDb });
  if (db) {
    await app.register(authRoutes, { prefix: '/auth', db, discord, appUrl: allowedOrigin });
    await app.register(meRoutes, { prefix: '/api', db });
  }

  return app;
}
