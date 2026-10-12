import { updateMeSchema, type Me } from '@le-uma/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/authenticate';
import { avatarUrl } from '../auth/discord';
import type { User } from '../auth/users';
import type { Db } from '../db/client';
import { users } from '../db/schema';

export function toMe(user: User): Me {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: avatarUrl(user.discordId, user.avatarHash),
    timezone: user.timezone,
  };
}

export const meRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  app.get('/me', async (req) => toMe(req.user!));

  app.patch('/me', async (req, reply) => {
    const body = updateMeSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
    }
    const [user] = await db
      .update(users)
      .set({ timezone: body.data.timezone, updatedAt: sql`now()` })
      .where(eq(users.id, req.user!.id))
      .returning();
    return toMe(user!);
  });
};
