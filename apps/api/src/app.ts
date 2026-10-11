import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Config } from './config';
import { healthRoutes, type DbPing } from './routes/health';

export interface AppDeps {
  config: Pick<Config, 'NODE_ENV' | 'LOG_LEVEL' | 'SESSION_SECRET' | 'APP_URL'>;
  /** Resolves when the database answers; rejects when it doesn't. */
  pingDb: DbPing;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ config, pingDb, logger }: AppDeps) {
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

  await app.register(healthRoutes, { prefix: '/api', pingDb });

  return app;
}
