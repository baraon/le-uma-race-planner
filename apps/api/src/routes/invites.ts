/** Invite links: `/invite/<token>` in the web app. Only the token's SHA-256 is stored. */
import type { InvitePreview } from '@le-uma/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/authenticate';
import type { Db } from '../db/client';
import { groupInvites, groupMembers, groups } from '../db/schema';
import { hashInviteToken } from './groups';
import { HttpError, notFound } from './http';

const tokenSchema = z.string().regex(/^[\w-]{16,64}$/);

type InviteRow = typeof groupInvites.$inferSelect;

function tokenHash(params: unknown): string {
  const token = tokenSchema.safeParse((params as { token?: unknown }).token);
  if (!token.success) throw notFound('Invite not found');
  return hashInviteToken(token.data);
}

/** 410 for links that existed but can no longer be used. */
function assertUsable(invite: InviteRow, now = new Date()) {
  if (invite.expiresAt && invite.expiresAt <= now) {
    throw new HttpError(410, 'This invite link has expired');
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    throw new HttpError(410, 'This invite link has been used up');
  }
}

export const inviteRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  // Invite links are guessable only by brute force; keep that slow.
  const rateLimit = { max: 30, timeWindow: '1 minute' };

  app.get('/invites/:token', { config: { rateLimit } }, async (req): Promise<InvitePreview> => {
    const hash = tokenHash(req.params);
    const [row] = await db
      .select({
        invite: groupInvites,
        group: groups,
        memberCount: sql<number>`(SELECT count(*)::int FROM group_members m WHERE m.group_id = ${groups.id})`,
        alreadyMember: sql<boolean>`EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = ${groups.id} AND m.user_id = ${req.user!.id})`,
      })
      .from(groupInvites)
      .innerJoin(groups, eq(groups.id, groupInvites.groupId))
      .where(eq(groupInvites.tokenHash, hash));
    if (!row) throw notFound('Invite not found');
    if (!row.alreadyMember) assertUsable(row.invite);
    return {
      groupId: row.group.id,
      groupName: row.group.name,
      memberCount: row.memberCount,
      alreadyMember: row.alreadyMember,
    };
  });

  app.post('/invites/:token/accept', { config: { rateLimit } }, async (req) => {
    const hash = tokenHash(req.params);
    const userId = req.user!.id;

    return db.transaction(async (tx) => {
      // Lock the invite so two people can't both take its last use.
      const [invite] = await tx
        .select()
        .from(groupInvites)
        .where(eq(groupInvites.tokenHash, hash))
        .for('update');
      if (!invite) throw notFound('Invite not found');

      const [existing] = await tx
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, invite.groupId), eq(groupMembers.userId, userId)));
      // Already in: nothing to do, and don't spend a use.
      if (existing) return { groupId: invite.groupId };

      assertUsable(invite);
      await tx.insert(groupMembers).values({ groupId: invite.groupId, userId });
      await tx
        .update(groupInvites)
        .set({ useCount: sql`${groupInvites.useCount} + 1` })
        .where(eq(groupInvites.id, invite.id));
      return { groupId: invite.groupId };
    });
  });
};
