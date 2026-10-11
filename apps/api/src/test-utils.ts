/** Helpers for API tests that run against a real Postgres (skipped without DATABASE_URL). */
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { createSession, SESSION_COOKIE } from './auth/sessions';
import { upsertDiscordUser } from './auth/users';
import { createDb, createSql, type Db, type Sql } from './db/client';
import { migrate } from './db/migrate';

/** The dev stack points tests at a separate database; CI uses its throwaway DATABASE_URL. */
export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
export const APP_URL = 'http://localhost:5173';

export const testConfig = {
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'error' as const,
  SESSION_SECRET: 'x'.repeat(32),
  APP_URL,
};

let seq = 0;
/** Unique per call (and per test file) so test files can share one database. */
export const newDiscordId = () =>
  `${Date.now()}${process.pid % 1000}${String(++seq).padStart(4, '0')}`;

export async function openTestDb(): Promise<{ sql: Sql; db: Db }> {
  const sql = createSql(DATABASE_URL!);
  await migrate(sql, undefined, () => {});
  return { sql, db: createDb(sql) };
}

export interface TestUser {
  id: string;
  name: string;
  /** Headers for app.inject: session cookie plus a same-origin Origin. */
  headers: { cookie: string; origin: string };
}

/** A user with a live session, created directly (no Discord round trip). */
export async function signedInUser(db: Db, name: string): Promise<TestUser> {
  const user = await upsertDiscordUser(db, {
    discordId: newDiscordId(),
    username: name,
    displayName: null,
    avatarHash: null,
  });
  const { token } = await createSession(db, user.id);
  return { id: user.id, name, headers: { cookie: `${SESSION_COOKIE}=${token}`, origin: APP_URL } };
}

export function testApp(db: Db): Promise<FastifyInstance> {
  return buildApp({ config: testConfig, pingDb: async () => 1, db, logger: false });
}
