/**
 * The stint plan for an event. Any group member can read it; owners/admins with `manageEvents`
 * save it. Saving replaces the whole plan in one transaction. Drivers must be on the event's
 * team; spotters can be any group member.
 */
import { saveStintsSchema, type Stint } from '@le-uma/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/authenticate';
import { can } from '../auth/permissions';
import type { Db } from '../db/client';
import { groupMembers, stints, teamMembers } from '../db/schema';
import { eventContext } from './events';
import { forbidden, HttpError, idParam, parseBody } from './http';

async function loadPlan(db: Db, eventId: string): Promise<Stint[]> {
  const rows = await db
    .select()
    .from(stints)
    .where(eq(stints.eventId, eventId))
    .orderBy(asc(stints.position));
  return rows.map((r) => ({
    driverId: r.driverId,
    spotterId: r.spotterId,
    lapsOverride: r.lapsOverride,
    lapMsOverride: r.lapMsOverride,
    extraPitSeconds: r.extraPitSeconds,
    notes: r.notes,
  }));
}

export const stintRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  app.get('/events/:eventId/stints', async (req) => {
    const eventId = idParam(req.params, 'eventId');
    await eventContext(db, eventId, req.user!.id);
    return loadPlan(db, eventId);
  });

  app.put('/events/:eventId/stints', async (req) => {
    const eventId = idParam(req.params, 'eventId');
    const { event, membership } = await eventContext(db, eventId, req.user!.id);
    if (!can(membership, 'manageEvents')) throw forbidden();
    const { stints: plan } = parseBody(saveStintsSchema, req.body);

    const driverIds = [...new Set(plan.map((s) => s.driverId).filter((id): id is string => !!id))];
    const spotterIds = [
      ...new Set(plan.map((s) => s.spotterId).filter((id): id is string => !!id)),
    ];
    if (driverIds.length > 0) {
      const onTeam = await db
        .select({ id: teamMembers.userId })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, event.teamId), inArray(teamMembers.userId, driverIds)));
      if (onTeam.length !== driverIds.length) {
        throw new HttpError(400, `Every driver must be on ${event.teamName}`);
      }
    }
    if (spotterIds.length > 0) {
      const inGroup = await db
        .select({ id: groupMembers.userId })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, event.groupId), inArray(groupMembers.userId, spotterIds)),
        );
      if (inGroup.length !== spotterIds.length) {
        throw new HttpError(400, `Every spotter must be a member of ${event.groupName}`);
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(stints).where(eq(stints.eventId, eventId));
      if (plan.length > 0) {
        await tx.insert(stints).values(
          plan.map((s, position) => ({
            eventId,
            position,
            driverId: s.driverId,
            spotterId: s.spotterId,
            lapsOverride: s.lapsOverride,
            lapMsOverride: s.lapMsOverride,
            extraPitSeconds: s.extraPitSeconds,
            notes: s.notes?.trim() || null,
          })),
        );
      }
    });
    return loadPlan(db, eventId);
  });
};
