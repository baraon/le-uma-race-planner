/**
 * Login, session and profile tests against a real Postgres (CI provides one; skipped without
 * DATABASE_URL) and a fake Discord: nothing here touches the network.
 */
import { meSchema } from '@le-uma/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createDiscordClient, type DiscordClient, type DiscordUser } from '../auth/discord';
import {
  createSession,
  hashToken,
  purgeExpiredSessions,
  resolveSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '../auth/sessions';
import { upsertDiscordUser } from '../auth/users';
import { createDb, createSql, type Db, type Sql } from '../db/client';
import { migrate } from '../db/migrate';
import { sessions, users } from '../db/schema';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const APP_URL = 'http://localhost:5173';
const DAY = 24 * 60 * 60 * 1000;

const config = {
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'error' as const,
  SESSION_SECRET: 'x'.repeat(32),
  APP_URL,
};

/** Unique per call so test files can share one database. */
let seq = 0;
const newDiscordId = () => `${Date.now()}${String(++seq).padStart(4, '0')}`;

function fakeDiscord(user: Partial<DiscordUser> = {}) {
  const real = createDiscordClient({
    clientId: '123456',
    clientSecret: 'not-a-secret',
    redirectUri: `${APP_URL}/auth/discord/callback`,
  });
  const profile: DiscordUser = {
    id: newDiscordId(),
    username: 'driver',
    globalName: 'Fast Driver',
    avatar: 'abc123',
    ...user,
  };
  const codes: string[] = [];
  const client: DiscordClient = {
    authorizeUrl: real.authorizeUrl,
    async fetchUser(code) {
      codes.push(code);
      if (code === 'bad-code') throw new Error('invalid_grant');
      return profile;
    },
  };
  return { client, profile, codes };
}

const cookieHeader = (cookies: Record<string, string>) =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

describe.skipIf(!DATABASE_URL)('Discord login and sessions', () => {
  let sql: Sql;
  let db: Db;

  beforeAll(async () => {
    sql = createSql(DATABASE_URL!);
    await migrate(sql, undefined, () => {});
    db = createDb(sql);
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function makeApp(discord: DiscordClient | null) {
    return buildApp({ config, pingDb: async () => 1, db, discord, logger: false });
  }

  /** Runs the redirect → callback dance; returns the callback response. */
  async function login(app: FastifyInstance, extraCookies: Record<string, string> = {}) {
    const start = await app.inject({ method: 'GET', url: '/auth/discord' });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const stateCookie = start.cookies.find((c) => c.name === 'le_uma_oauth_state')!;
    return app.inject({
      method: 'GET',
      url: `/auth/discord/callback?code=good-code&state=${encodeURIComponent(state)}`,
      headers: { cookie: cookieHeader({ le_uma_oauth_state: stateCookie.value, ...extraCookies }) },
    });
  }

  const sessionFrom = (res: { cookies: { name: string; value: string }[] }) =>
    res.cookies.find((c) => c.name === SESSION_COOKIE && c.value)?.value;

  it('redirects to Discord asking only for the identify scope', async () => {
    const app = await makeApp(fakeDiscord().client);
    const res = await app.inject({ method: 'GET', url: '/auth/discord' });

    expect(res.statusCode).toBe(302);
    const url = new URL(res.headers.location as string);
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('scope')).toBe('identify');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(`${APP_URL}/auth/discord/callback`);
    expect(url.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.has('permissions')).toBe(false);

    const stateCookie = res.cookies.find((c) => c.name === 'le_uma_oauth_state')!;
    expect(stateCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
    // Signed, so a value planted by someone else won't verify.
    expect(stateCookie.value).not.toBe(url.searchParams.get('state'));
    await app.close();
  });

  it('signs in: stores the profile, a hashed session, and no Discord tokens', async () => {
    const discord = fakeDiscord();
    const app = await makeApp(discord.client);
    const res = await login(app);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/`);
    expect(discord.codes).toEqual(['good-code']);

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(cookie.value).toMatch(/^[\w-]{43}$/);

    const [user] = await db.select().from(users).where(eq(users.discordId, discord.profile.id));
    expect(user).toMatchObject({
      username: 'driver',
      displayName: 'Fast Driver',
      avatarHash: 'abc123',
      timezone: null,
    });
    expect(Object.keys(user!).sort()).toEqual(
      [
        'avatarHash',
        'createdAt',
        'discordId',
        'displayName',
        'id',
        'timezone',
        'updatedAt',
        'username',
      ].sort(),
    );

    const stored = await db.select().from(sessions).where(eq(sessions.userId, user!.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe(hashToken(cookie.value));
    expect(stored[0]!.id).not.toBe(cookie.value);
    await app.close();
  });

  it('updates the profile on later logins and rotates the session', async () => {
    const first = fakeDiscord();
    const app1 = await makeApp(first.client);
    const oldToken = sessionFrom(await login(app1))!;
    await app1.close();

    const second = fakeDiscord({ id: first.profile.id, username: 'renamed', avatar: null });
    const app2 = await makeApp(second.client);
    const newToken = sessionFrom(await login(app2, { [SESSION_COOKIE]: oldToken }))!;

    expect(newToken).not.toBe(oldToken);
    expect(await resolveSession(db, oldToken)).toBeNull();
    const me = await app2.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `${SESSION_COOKIE}=${newToken}` },
    });
    expect(me.json()).toMatchObject({ username: 'renamed' });
    expect(me.json().avatarUrl).toMatch(
      /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d\.png$/,
    );
    await app2.close();
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const discord = fakeDiscord();
    const app = await makeApp(discord.client);
    const start = await app.inject({ method: 'GET', url: '/auth/discord' });
    const stateCookie = start.cookies.find((c) => c.name === 'le_uma_oauth_state')!;

    const forged = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=good-code&state=attacker-state',
      headers: { cookie: `le_uma_oauth_state=${stateCookie.value}` },
    });
    expect(forged.headers.location).toBe(`${APP_URL}/?login=failed`);
    expect(sessionFrom(forged)).toBeUndefined();

    const noCookie = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=good-code&state=whatever',
    });
    expect(noCookie.headers.location).toBe(`${APP_URL}/?login=failed`);

    // An unsigned cookie that matches the state is still rejected.
    const unsigned = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=good-code&state=planted',
      headers: { cookie: 'le_uma_oauth_state=planted' },
    });
    expect(unsigned.headers.location).toBe(`${APP_URL}/?login=failed`);

    expect(discord.codes).toEqual([]);
    await app.close();
  });

  it('sends the user back with a reason when Discord login is denied or fails', async () => {
    const discord = fakeDiscord();
    const app = await makeApp(discord.client);

    const denied = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?error=access_denied&state=x',
    });
    expect(denied.headers.location).toBe(`${APP_URL}/?login=denied`);

    const start = await app.inject({ method: 'GET', url: '/auth/discord' });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const stateCookie = start.cookies.find((c) => c.name === 'le_uma_oauth_state')!;
    const failed = await app.inject({
      method: 'GET',
      url: `/auth/discord/callback?code=bad-code&state=${state}`,
      headers: { cookie: `le_uma_oauth_state=${stateCookie.value}` },
    });
    expect(failed.headers.location).toBe(`${APP_URL}/?login=failed`);
    expect(sessionFrom(failed)).toBeUndefined();
    await app.close();
  });

  it('returns to a same-site path after login, never an outside URL', async () => {
    const app = await makeApp(fakeDiscord().client);
    const loginVia = async (returnTo: string) => {
      const start = await app.inject({
        method: 'GET',
        url: `/auth/discord?returnTo=${encodeURIComponent(returnTo)}`,
      });
      const state = new URL(start.headers.location as string).searchParams.get('state')!;
      const stateCookie = start.cookies.find((c) => c.name === 'le_uma_oauth_state')!;
      const res = await app.inject({
        method: 'GET',
        url: `/auth/discord/callback?code=good-code&state=${encodeURIComponent(state)}`,
        headers: { cookie: `le_uma_oauth_state=${stateCookie.value}` },
      });
      return res.headers.location;
    };

    expect(await loginVia('/invite/abc_DEF-123')).toBe(`${APP_URL}/invite/abc_DEF-123`);
    expect(await loginVia('//evil.example/x')).toBe(`${APP_URL}/`);
    expect(await loginVia('https://evil.example')).toBe(`${APP_URL}/`);
    expect(await loginVia('/\\evil.example')).toBe(`${APP_URL}/`);
    await app.close();
  });

  it('reports login as unavailable when Discord is not configured', async () => {
    const app = await makeApp(null);
    const res = await app.inject({ method: 'GET', url: '/auth/discord' });
    expect(res.headers.location).toBe(`${APP_URL}/?login=unavailable`);
    await app.close();
  });

  it('serves /api/me, updates the timezone, and logs out', async () => {
    const app = await makeApp(fakeDiscord().client);
    const token = sessionFrom(await login(app))!;
    const headers = { cookie: `${SESSION_COOKIE}=${token}` };

    const me = await app.inject({ method: 'GET', url: '/api/me', headers });
    expect(me.statusCode).toBe(200);
    expect(meSchema.parse(me.json())).toMatchObject({
      displayName: 'Fast Driver',
      timezone: null,
      avatarUrl: expect.stringMatching(/\/avatars\/\d+\/abc123\.png/),
    });

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...headers, origin: APP_URL },
      payload: { timezone: 'America/Chicago' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().timezone).toBe('America/Chicago');

    for (const timezone of ['UTC-5', '-05:00', 'Mars/Olympus_Mons', '']) {
      const bad = await app.inject({
        method: 'PATCH',
        url: '/api/me',
        headers,
        payload: { timezone },
      });
      expect(bad.statusCode, timezone).toBe(400);
    }
    const extra = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers,
      payload: { timezone: 'UTC', username: 'hijack' },
    });
    expect(extra.statusCode).toBe(400);

    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers });
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, hashToken(token))),
    ).toEqual([]);

    const after = await app.inject({ method: 'GET', url: '/api/me', headers });
    expect(after.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 without a session', async () => {
    const app = await makeApp(fakeDiscord().client);
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    const bogus = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { cookie: `${SESSION_COOKIE}=not-a-real-token` },
      payload: { timezone: 'UTC' },
    });
    expect(bogus.statusCode).toBe(401);
    await app.close();
  });

  it('slides the expiry forward, rejects expired sessions, and purges them', async () => {
    const user = await upsertDiscordUser(db, {
      discordId: newDiscordId(),
      username: 'sessions',
      displayName: null,
      avatarHash: null,
    });
    const now = new Date();

    // Fresh session: no write needed.
    const fresh = await createSession(db, user.id, now);
    expect((await resolveSession(db, fresh.token, now))?.renewedUntil).toBeNull();

    // Two days old: pushed out to a full 30 days from now.
    const older = await createSession(db, user.id, new Date(now.getTime() - 2 * DAY));
    const renewed = await resolveSession(db, older.token, now);
    expect(renewed?.renewedUntil?.getTime()).toBe(now.getTime() + SESSION_TTL_MS);

    // Older than 30 days: gone.
    const expired = await createSession(db, user.id, new Date(now.getTime() - 31 * DAY));
    expect(await resolveSession(db, expired.token, now)).toBeNull();

    expect(await purgeExpiredSessions(db, now)).toBeGreaterThanOrEqual(1);
    const left = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(left.map((s) => s.id).sort()).toEqual(
      [hashToken(fresh.token), hashToken(older.token)].sort(),
    );
  });

  it('rate-limits /auth/*', async () => {
    const app = await makeApp(fakeDiscord().client);
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push((await app.inject({ method: 'GET', url: '/auth/discord' })).statusCode);
    }
    expect(codes.slice(0, 20).every((c) => c === 302)).toBe(true);
    expect(codes[20]).toBe(429);
    await app.close();
  });
});
