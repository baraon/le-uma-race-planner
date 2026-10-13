/**
 * Events (races). Times cross the API as UTC ISO strings; the database stores timestamptz.
 * Any member of the group can see its events; creating and editing needs `manageEvents`.
 */
import { availabilityWindow, eventInputSchema, type RaceEvent } from '@le-uma/shared';
import { and, asc, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/authenticate';
import { can } from '../auth/permissions';
import type { Db } from '../db/client';
import { events, groupMembers, groups, teams } from '../db/schema';
import { requireMembership } from './groups';
import { clipAvailabilityToEvent } from '../db/availability';
import { forbidden, idParam, notFound, parseBody } from './http';

const eventEnd = sql`${events.startsAt} + make_interval(mins => ${events.durationMinutes})`;

async function selectEvents(db: Db, where: SQL | undefined): Promise<RaceEvent[]> {
  const rows = await db
    .select({ event: events, team: teams, group: groups })
    .from(events)
    .innerJoin(teams, eq(teams.id, events.teamId))
    .innerJoin(groups, eq(groups.id, teams.groupId))
    .where(where)
    .orderBy(asc(events.startsAt), asc(events.name));
  return rows.map(({ event, team, group }) => ({
    id: event.id,
    teamId: team.id,
    teamName: team.name,
    groupId: group.id,
    groupName: group.name,
    name: event.name,
    startsAt: event.startsAt.toISOString(),
    durationMinutes: event.durationMinutes,
    qualifyingMinutes: event.qualifyingMinutes,
    track: event.track,
    carClass: event.carClass,
    trackTimezone: event.trackTimezone,
    minDrivers: event.minDrivers,
    fuelUnit: event.fuelUnit,
    fuelCapacity: event.fuelCapacity,
    refuelSeconds: event.refuelSeconds,
    pitLaneLossSeconds: event.pitLaneLossSeconds,
  }));
}

/** The event and the caller's membership in its group; 404 for non-members. */
export async function eventContext(db: Db, eventId: string, userId: string) {
  const [event] = await selectEvents(db, eq(events.id, eventId));
  if (!event) throw notFound('Event not found');
  const membership = await requireMembership(db, event.groupId, userId).catch(() => {
    throw notFound('Event not found');
  });
  return { event, membership };
}

export const eventRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  /** Events that haven't finished yet, across every group the caller is in. */
  app.get('/events/upcoming', async (req) => {
    const myGroups = db
      .select({ id: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, req.user!.id));
    return selectEvents(db, and(inArray(teams.groupId, myGroups), gt(eventEnd, sql`now()`)));
  });

  app.get('/groups/:groupId/events', async (req) => {
    const groupId = idParam(req.params, 'groupId');
    await requireMembership(db, groupId, req.user!.id);
    return selectEvents(db, eq(teams.groupId, groupId));
  });

  app.get('/events/:eventId', async (req) => {
    const eventId = idParam(req.params, 'eventId');
    return (await eventContext(db, eventId, req.user!.id)).event;
  });

  app.post('/teams/:teamId/events', async (req, reply) => {
    const teamId = idParam(req.params, 'teamId');
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) throw notFound('Team not found');
    const m = await requireMembership(db, team.groupId, req.user!.id).catch(() => {
      throw notFound('Team not found');
    });
    if (!can(m, 'manageEvents')) throw forbidden();

    const input = parseBody(eventInputSchema, req.body);
    const [row] = await db
      .insert(events)
      .values({ ...input, teamId, startsAt: new Date(input.startsAt), createdBy: req.user!.id })
      .returning({ id: events.id });
    const [created] = await selectEvents(db, eq(events.id, row!.id));
    return reply.code(201).send(created);
  });

  // Full replacement of the editable fields. The team can't change here.
  app.put('/events/:eventId', async (req) => {
    const eventId = idParam(req.params, 'eventId');
    const { event, membership } = await eventContext(db, eventId, req.user!.id);
    if (!can(membership, 'manageEvents')) throw forbidden();

    const input = parseBody(eventInputSchema, req.body);
    const startsAt = new Date(input.startsAt);
    const moved =
      startsAt.getTime() !== new Date(event.startsAt).getTime() ||
      input.durationMinutes !== event.durationMinutes ||
      input.qualifyingMinutes !== event.qualifyingMinutes;
    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({ ...input, startsAt })
        .where(eq(events.id, eventId));
      // Saved availability keeps its real-world times, trimmed to the new window (qualifying
      // included when the event has it).
      if (moved) {
        await clipAvailabilityToEvent(tx, eventId, availabilityWindow({ ...input, startsAt }));
      }
    });
    const [updated] = await selectEvents(db, eq(events.id, eventId));
    return updated;
  });

  app.delete('/events/:eventId', async (req, reply) => {
    const eventId = idParam(req.params, 'eventId');
    const { membership } = await eventContext(db, eventId, req.user!.id);
    if (!can(membership, 'manageEvents')) throw forbidden();
    await db.delete(events).where(eq(events.id, eventId));
    return reply.code(204).send();
  });
};
