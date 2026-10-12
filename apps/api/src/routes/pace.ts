/**
 * Driver pace, seen through an event: each team driver's profile for the event's track, car
 * class and fuel unit. Profiles are reusable across events with the same three. A driver edits
 * their own; owners/admins with `manageEvents` can edit anyone's on the team.
 */
import { savePaceSchema, trackKey, type PaceRow } from '@le-uma/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/authenticate';
import { can } from '../auth/permissions';
import type { Db } from '../db/client';
import { driverPace, events, teamMembers } from '../db/schema';
import { eventContext } from './events';
import { conflict, forbidden, idParam, parseBody } from './http';

type PaceRecord = typeof driverPace.$inferSelect;

const toRow = (p: PaceRecord): PaceRow => ({
  userId: p.userId,
  lapMs: p.lapMs,
  consumptionPerLap: p.consumptionPerLap,
  updatedAt: p.updatedAt.toISOString(),
  updatedBy: p.updatedBy,
});

/** The event's track/class/unit, or a 409 explaining what the organiser must set first. */
async function paceKey(db: Db, eventId: string) {
  const [e] = await db
    .select({ track: events.track, carClass: events.carClass, fuelUnit: events.fuelUnit })
    .from(events)
    .where(eq(events.id, eventId));
  if (!e?.track || !e.carClass) {
    throw conflict('Set the event’s track and car class first: pace is saved per track and class');
  }
  return {
    track: e.track,
    carClass: e.carClass,
    trackKey: trackKey(e.track),
    classKey: trackKey(e.carClass),
    fuelUnit: e.fuelUnit,
  };
}

export const paceRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  app.get('/events/:eventId/pace', async (req): Promise<PaceRow[]> => {
    const eventId = idParam(req.params, 'eventId');
    const { event } = await eventContext(db, eventId, req.user!.id);
    if (!event.track || !event.carClass) return [];
    const key = await paceKey(db, eventId);
    const drivers = db
      .select({ id: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, event.teamId));
    const rows = await db
      .select()
      .from(driverPace)
      .where(
        and(
          inArray(driverPace.userId, drivers),
          eq(driverPace.trackKey, key.trackKey),
          eq(driverPace.classKey, key.classKey),
          eq(driverPace.fuelUnit, key.fuelUnit),
        ),
      );
    return rows.map(toRow);
  });

  /** Checks the caller may edit `targetId`'s pace for this event; returns the profile key. */
  async function editable(eventId: string, callerId: string, targetId: string) {
    const { event, membership } = await eventContext(db, eventId, callerId);
    if (targetId !== callerId && !can(membership, 'manageEvents')) throw forbidden();
    const [onTeam] = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, event.teamId), eq(teamMembers.userId, targetId)));
    if (!onTeam) throw conflict(`Only drivers on ${event.teamName} have pace for this event`);
    return paceKey(db, eventId);
  }

  app.put('/events/:eventId/pace/:userId', async (req): Promise<PaceRow> => {
    const eventId = idParam(req.params, 'eventId');
    const targetId = idParam(req.params, 'userId');
    const key = await editable(eventId, req.user!.id, targetId);
    const { lapMs, consumptionPerLap } = parseBody(savePaceSchema, req.body);

    const [row] = await db
      .insert(driverPace)
      .values({ userId: targetId, ...key, lapMs, consumptionPerLap, updatedBy: req.user!.id })
      .onConflictDoUpdate({
        target: [driverPace.userId, driverPace.trackKey, driverPace.classKey, driverPace.fuelUnit],
        set: {
          lapMs,
          consumptionPerLap,
          track: key.track,
          carClass: key.carClass,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toRow(row!);
  });

  app.delete('/events/:eventId/pace/:userId', async (req, reply) => {
    const eventId = idParam(req.params, 'eventId');
    const targetId = idParam(req.params, 'userId');
    const key = await editable(eventId, req.user!.id, targetId);
    await db
      .delete(driverPace)
      .where(
        and(
          eq(driverPace.userId, targetId),
          eq(driverPace.trackKey, key.trackKey),
          eq(driverPace.classKey, key.classKey),
          eq(driverPace.fuelUnit, key.fuelUnit),
        ),
      );
    return reply.code(204).send();
  });
};
