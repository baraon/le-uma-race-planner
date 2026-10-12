/**
 * Our own sessions. The browser holds a random 32-byte token in an httpOnly cookie; the
 * database holds only its SHA-256, so a leaked database can't be replayed as cookies.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import type { User } from './users';

export const SESSION_COOKIE = 'le_uma_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend a session at most once a day, so reads don't turn into a write per request. */
const EXTEND_AFTER_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/**
 * The user for a session token, or null if it's unknown or expired. Slides the expiry forward
 * when it's more than a day old; `renewedUntil` tells the caller to refresh the cookie too.
 */
export async function resolveSession(
  db: Db,
  token: string,
  now = new Date(),
): Promise<{ user: User; renewedUntil: Date | null } | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));
  if (!row) return null;

  let renewedUntil: Date | null = null;
  if (row.expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - EXTEND_AFTER_MS) {
    renewedUntil = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
  }
  return { user: row.user, renewedUntil };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function purgeExpiredSessions(db: Db, now = new Date()): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lte(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  return deleted.length;
}
