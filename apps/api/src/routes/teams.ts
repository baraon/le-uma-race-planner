import { createTeamSchema } from '@lmu/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/authenticate';
import { can } from '../auth/permissions';
import type { Db } from '../db/client';
import { teamMembers, teams } from '../db/schema';
import { loadGroupDetail, requireMembership } from './groups';
import { conflict, forbidden, idParam, notFound, parseBody, pgCode } from './http';

const duplicateName = (err: unknown) => {
  if (pgCode(err) === '23505') throw conflict('This group already has a team with that name');
  throw err;
};

/** The team's group, after checking the caller belongs to it. */
async function teamContext(db: Db, teamId: string, userId: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw notFound('Team not found');
  const membership = await requireMembership(db, team.groupId, userId).catch(() => {
    throw notFound('Team not found');
  });
  return { team, membership };
}

export const teamRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  app.post('/groups/:groupId/teams', async (req, reply) => {
    const groupId = idParam(req.params, 'groupId');
    const m = await requireMembership(db, groupId, req.user!.id);
    if (!can(m, 'manageTeams')) throw forbidden();
    const { name } = parseBody(createTeamSchema, req.body);
    await db.insert(teams).values({ groupId, name, createdBy: req.user!.id }).catch(duplicateName);
    return reply.code(201).send(await loadGroupDetail(db, groupId, req.user!.id));
  });

  app.patch('/teams/:teamId', async (req) => {
    const teamId = idParam(req.params, 'teamId');
    const { team, membership } = await teamContext(db, teamId, req.user!.id);
    if (!can(membership, 'manageTeams')) throw forbidden();
    const { name } = parseBody(createTeamSchema, req.body);
    await db.update(teams).set({ name }).where(eq(teams.id, teamId)).catch(duplicateName);
    return loadGroupDetail(db, team.groupId, req.user!.id);
  });

  // Deleting a team deletes its events too (ON DELETE CASCADE); the UI warns about that.
  app.delete('/teams/:teamId', async (req, reply) => {
    const teamId = idParam(req.params, 'teamId');
    const { membership } = await teamContext(db, teamId, req.user!.id);
    if (!can(membership, 'manageTeams')) throw forbidden();
    await db.delete(teams).where(eq(teams.id, teamId));
    return reply.code(204).send();
  });

  // Drivers put themselves on (and take themselves off) teams.
  app.post('/teams/:teamId/join', async (req) => {
    const teamId = idParam(req.params, 'teamId');
    const { team } = await teamContext(db, teamId, req.user!.id);
    await db.insert(teamMembers).values({ teamId, userId: req.user!.id }).onConflictDoNothing();
    return loadGroupDetail(db, team.groupId, req.user!.id);
  });

  app.post('/teams/:teamId/leave', async (req) => {
    const teamId = idParam(req.params, 'teamId');
    const { team } = await teamContext(db, teamId, req.user!.id);
    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, req.user!.id)));
    return loadGroupDetail(db, team.groupId, req.user!.id);
  });
};
