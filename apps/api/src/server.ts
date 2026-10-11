import { buildApp } from './app';
import { loadConfig } from './config';
import { createSql } from './db/client';
import { migrate } from './db/migrate';

const config = loadConfig();
const sql = createSql(config.DATABASE_URL);

if (config.RUN_MIGRATIONS) {
  await migrate(sql);
}

const app = await buildApp({
  config,
  pingDb: () => sql`SELECT 1`,
});

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
