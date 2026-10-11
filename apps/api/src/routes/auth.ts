/**
 * Discord OAuth2 login (authorization code flow, `identify` scope only) and logout.
 * Failures send the browser back to the app with `?login=<reason>` rather than showing JSON.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { clearSessionCookie, sessionToken, setSessionCookie } from '../auth/authenticate';
import type { DiscordClient } from '../auth/discord';
import { createSession, deleteSession } from '../auth/sessions';
import { upsertDiscordUser } from '../auth/users';
import type { Db } from '../db/client';

const STATE_COOKIE = 'lmu_oauth_state';
const STATE_TTL_SECONDS = 10 * 60;

/** Login and logout are cheap to abuse; keep them well under the global limit. */
const rateLimit = { max: 20, timeWindow: '1 minute' };

const callbackQuery = z.object({
  code: z.string().min(1).max(512).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(200).optional(),
});

export interface AuthRoutesOptions {
  db: Db;
  /** null when Discord credentials aren't configured; login then reports "unavailable". */
  discord: DiscordClient | null;
  appUrl: string;
}

function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app,
  { db, discord, appUrl },
) => {
  const backToApp = (reason?: 'denied' | 'failed' | 'unavailable') =>
    reason ? `${appUrl}/?login=${reason}` : `${appUrl}/`;

  app.get('/discord', { config: { rateLimit } }, async (_req, reply) => {
    if (!discord) return reply.redirect(backToApp('unavailable'));

    const state = randomBytes(32).toString('base64url');
    reply.setCookie(STATE_COOKIE, state, {
      path: '/auth/discord',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: STATE_TTL_SECONDS,
      signed: true,
    });
    return reply.redirect(discord.authorizeUrl(state));
  });

  app.get('/discord/callback', { config: { rateLimit } }, async (req, reply) => {
    const signedState = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/auth/discord' });
    if (!discord) return reply.redirect(backToApp('unavailable'));

    const query = callbackQuery.safeParse(req.query);
    if (!query.success) return reply.redirect(backToApp('failed'));
    const { code, state, error } = query.data;
    if (error) return reply.redirect(backToApp(error === 'access_denied' ? 'denied' : 'failed'));

    // CSRF: the state Discord echoes back must match the one we put in our signed cookie.
    const expected = signedState ? req.unsignCookie(signedState) : null;
    if (
      !code ||
      !state ||
      !expected?.valid ||
      !expected.value ||
      !sameString(expected.value, state)
    ) {
      req.log.warn('Discord callback with missing or mismatched state');
      return reply.redirect(backToApp('failed'));
    }

    let profile;
    try {
      profile = await discord.fetchUser(code);
    } catch (err) {
      req.log.warn({ err }, 'Discord login failed');
      return reply.redirect(backToApp('failed'));
    }

    const user = await upsertDiscordUser(db, {
      discordId: profile.id,
      username: profile.username,
      displayName: profile.globalName,
      avatarHash: profile.avatar,
    });

    // Rotate: a fresh login never reuses whatever session the browser had before.
    const previous = sessionToken(req);
    if (previous) await deleteSession(db, previous);
    const { token, expiresAt } = await createSession(db, user.id);
    setSessionCookie(reply, token, expiresAt);
    return reply.redirect(backToApp());
  });

  app.post('/logout', { config: { rateLimit } }, async (req, reply) => {
    const token = sessionToken(req);
    if (token) await deleteSession(db, token);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
};
