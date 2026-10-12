import { createHash, randomBytes } from 'node:crypto';
import {
  createGroupSchema,
  createInviteSchema,
  updateMemberSchema,
  type CreatedInvite,
  type GroupDetail,
  type GroupSummary,
  type Invite,
} from '@le-uma/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/authenticate';
import {
  can,
  effectivePermissions,
  getMembership,
  permissionColumns,
  storedPermissions,
  type Membership,
} from '../auth/permissions';
import type { Db } from '../db/client';
import { groupInvites, groupMembers, groups, teamMembers, teams, users } from '../db/schema';
import { forbidden, conflict, idParam, notFound, parseBody, pgCode } from './http';
import { toMe } from './me';

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** "Night Owls Racing!" → "night-owls-racing" (+ a random suffix if that's taken). */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return base || 'group';
}

const memberCount = sql<number>`(SELECT count(*)::int FROM group_members m WHERE m.group_id = ${groups.id})`;

/** Loads the caller's membership or throws 404, so non-members can't probe group IDs. */
export async function requireMembership(
  db: Db,
  groupId: string,
  userId: string,
): Promise<Membership> {
  const m = await getMembership(db, groupId, userId);
  if (!m) throw notFound('Group not found');
  return m;
}

export async function loadGroupDetail(
  db: Db,
  groupId: string,
  viewerId: string,
): Promise<GroupDetail> {
  const [row] = await db
    .select({ group: groups, me: groupMembers, memberCount })
    .from(groups)
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, viewerId)),
    )
    .where(eq(groups.id, groupId));
  if (!row) throw notFound('Group not found');

  const memberRows = await db
    .select({ member: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(
      sql`CASE ${groupMembers.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
      asc(groupMembers.joinedAt),
    );

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.groupId, groupId))
    .orderBy(asc(teams.name));
  const teamMemberRows = await db
    .select({ teamId: teamMembers.teamId, userId: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teams.groupId, groupId))
    .orderBy(asc(teamMembers.joinedAt));

  return {
    id: row.group.id,
    name: row.group.name,
    ownerId: row.group.ownerId,
    role: row.me.role,
    permissions: effectivePermissions(row.me),
    memberCount: row.memberCount,
    members: memberRows.map(({ member, user }) => ({
      user: toMe(user),
      role: member.role,
      permissions: storedPermissions(member),
      joinedAt: member.joinedAt.toISOString(),
    })),
    teams: teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      memberIds: teamMemberRows.filter((tm) => tm.teamId === t.id).map((tm) => tm.userId),
    })),
  };
}

function toInvite(row: typeof groupInvites.$inferSelect): Invite {
  return {
    id: row.id,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    maxUses: row.maxUses,
    useCount: row.useCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export const groupRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  app.get('/groups', async (req): Promise<GroupSummary[]> => {
    const rows = await db
      .select({ group: groups, me: groupMembers, memberCount })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, req.user!.id))
      .orderBy(asc(groups.name));
    return rows.map(({ group, me, memberCount }) => ({
      id: group.id,
      name: group.name,
      role: me.role,
      permissions: effectivePermissions(me),
      memberCount,
    }));
  });

  app.post('/groups', async (req, reply) => {
    const { name } = parseBody(createGroupSchema, req.body);
    const userId = req.user!.id;
    const base = slugify(name);

    for (let attempt = 0; ; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      try {
        const groupId = await db.transaction(async (tx) => {
          const [group] = await tx
            .insert(groups)
            .values({ name, slug, ownerId: userId })
            .returning({ id: groups.id });
          await tx.insert(groupMembers).values({ groupId: group!.id, userId, role: 'owner' });
          return group!.id;
        });
        return reply.code(201).send(await loadGroupDetail(db, groupId, userId));
      } catch (err) {
        if (pgCode(err) !== '23505' || attempt >= 4) throw err;
      }
    }
  });

  app.get('/groups/:groupId', async (req) => {
    const groupId = idParam(req.params, 'groupId');
    return loadGroupDetail(db, groupId, req.user!.id);
  });

  app.delete('/groups/:groupId', async (req, reply) => {
    const groupId = idParam(req.params, 'groupId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (m.role !== 'owner') throw forbidden();
    await db.delete(groups).where(eq(groups.id, groupId));
    return reply.code(204).send();
  });

  app.post('/groups/:groupId/leave', async (req, reply) => {
    const groupId = idParam(req.params, 'groupId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (m.role === 'owner') throw conflict('The owner can’t leave; delete the group instead');
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, req.user!.id)));
    return reply.code(204).send();
  });

  // Only the owner grants or revokes admin permissions.
  app.put('/groups/:groupId/members/:userId/permissions', async (req) => {
    const groupId = idParam(req.params, 'groupId');
    const targetId = idParam(req.params, 'userId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (m.role !== 'owner') throw forbidden();
    const permissions = parseBody(updateMemberSchema, req.body);

    const target = await getMembership(db, groupId, targetId);
    if (!target) throw notFound('Member not found');
    if (target.role === 'owner') throw conflict('The owner already has every permission');

    const isAdmin = Object.values(permissions).some(Boolean);
    await db
      .update(groupMembers)
      .set({ role: isAdmin ? 'admin' : 'member', ...permissionColumns(permissions) })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetId)));
    return loadGroupDetail(db, groupId, req.user!.id);
  });

  // Members managers remove drivers; only the owner can remove an admin.
  app.delete('/groups/:groupId/members/:userId', async (req, reply) => {
    const groupId = idParam(req.params, 'groupId');
    const targetId = idParam(req.params, 'userId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (!can(m, 'manageMembers')) throw forbidden();
    if (targetId === req.user!.id) throw conflict('Use “Leave group” to remove yourself');

    const target = await getMembership(db, groupId, targetId);
    if (!target) throw notFound('Member not found');
    if (target.role === 'owner') throw forbidden();
    if (target.role === 'admin' && m.role !== 'owner') throw forbidden();

    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetId)));
    return reply.code(204).send();
  });

  app.get('/groups/:groupId/invites', async (req): Promise<Invite[]> => {
    const groupId = idParam(req.params, 'groupId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (!can(m, 'manageMembers')) throw forbidden();
    const rows = await db
      .select()
      .from(groupInvites)
      .where(eq(groupInvites.groupId, groupId))
      .orderBy(asc(groupInvites.createdAt));
    return rows.map(toInvite);
  });

  app.post('/groups/:groupId/invites', async (req, reply) => {
    const groupId = idParam(req.params, 'groupId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (!can(m, 'manageMembers')) throw forbidden();
    const { expiresInHours, maxUses } = parseBody(createInviteSchema, req.body);

    const token = randomBytes(24).toString('base64url');
    const [row] = await db
      .insert(groupInvites)
      .values({
        groupId,
        tokenHash: hashInviteToken(token),
        createdBy: req.user!.id,
        expiresAt:
          expiresInHours === null ? null : new Date(Date.now() + expiresInHours * 3_600_000),
        maxUses,
      })
      .returning();
    const created: CreatedInvite = { ...toInvite(row!), token };
    return reply.code(201).send(created);
  });

  app.delete('/groups/:groupId/invites/:inviteId', async (req, reply) => {
    const groupId = idParam(req.params, 'groupId');
    const inviteId = idParam(req.params, 'inviteId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (!can(m, 'manageMembers')) throw forbidden();
    const deleted = await db
      .delete(groupInvites)
      .where(and(eq(groupInvites.id, inviteId), eq(groupInvites.groupId, groupId)))
      .returning({ id: groupInvites.id });
    if (deleted.length === 0) throw notFound('Invite not found');
    return reply.code(204).send();
  });
};
