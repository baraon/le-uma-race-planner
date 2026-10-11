import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Db } from '../db/client';
import { resolveSession, SESSION_COOKIE } from './sessions';
import type { User } from './users';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireUser` on routes that need a signed-in user. */
    user: User | null;
  }
}

/** httpOnly so scripts can't read it; Lax so it survives the redirect back from Discord. */
export function sessionCookieOptions(expires: Date): CookieSerializeOptions {
  return { path: '/', httpOnly: true, secure: true, sameSite: 'lax', expires };
}

export function setSessionCookie(reply: FastifyReply, token: string, expires: Date): void {
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expires));
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
}

export function sessionToken(req: FastifyRequest): string | undefined {
  return req.cookies[SESSION_COOKIE] || undefined;
}

/** preHandler: 401 unless the request carries a live session; otherwise sets `req.user`. */
export function requireUser(db: Db): preHandlerAsyncHookHandler {
  return async (req, reply) => {
    const token = sessionToken(req);
    const session = token ? await resolveSession(db, token) : null;
    if (!token || !session) {
      if (token) clearSessionCookie(reply);
      return reply.code(401).send({ error: 'Not signed in' });
    }
    req.user = session.user;
    if (session.renewedUntil) setSessionCookie(reply, token, session.renewedUntil);
  };
}
