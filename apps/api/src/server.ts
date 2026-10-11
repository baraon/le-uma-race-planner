import { buildApp } from './app';
import { createDiscordClient } from './auth/discord';
import { purgeExpiredSessions } from './auth/sessions';
import { loadConfig } from './config';
import { createDb, createSql } from './db/client';
import { migrate } from './db/migrate';

const config = loadConfig();
const sql = createSql(config.DATABASE_URL);

if (config.RUN_MIGRATIONS) {
  await migrate(sql);
}

const db = createDb(sql);
const discord =
  config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET
    ? createDiscordClient({
        clientId: config.DISCORD_CLIENT_ID,
        clientSecret: config.DISCORD_CLIENT_SECRET,
        redirectUri:
          config.DISCORD_REDIRECT_URI ?? new URL('/auth/discord/callback', config.APP_URL).href,
      })
    : null;

const app = await buildApp({
  config,
  pingDb: () => sql`SELECT 1`,
  db,
  discord,
});
if (!discord) app.log.warn('DISCORD_CLIENT_ID/SECRET not set; Discord login is disabled');

const purge = () =>
  purgeExpiredSessions(db).then(
    (n) => n > 0 && app.log.info(`purged ${n} expired sessions`),
    (err: unknown) => app.log.error({ err }, 'session purge failed'),
  );
void purge();
const purgeTimer = setInterval(() => void purge(), 60 * 60 * 1000);
purgeTimer.unref();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  clearInterval(purgeTimer);
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
