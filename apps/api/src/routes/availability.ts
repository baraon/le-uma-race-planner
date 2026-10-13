/**
 * Availability for an event. Any group member can read every driver's row. A driver saves their
 * own row; owners/admins with `manageAvailability` can save anyone's. Saving replaces the whole
 * row in one transaction, and the database (exclusion constraint + window/slot trigger) has the
 * final say.
 */
import {
  availabilityWindow,
  intervalToSlotRange,
  saveAvailabilitySchema,
  slotCount,
  slotRangeToInterval,
  type AvailabilityRow,
  type EventWindow,
  type RaceEvent,
} from '@le-uma/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/authenticate';
import { can } from '../auth/permissions';
import { loadAvailability, replaceAvailability, type StoredBlock } from '../db/availability';
import type { Db } from '../db/client';
import { teamMembers } from '../db/schema';
import { eventContext } from './events';
import { conflict, forbidden, HttpError, idParam, parseBody, pgCode } from './http';

/** Qualifying (when the event includes it) plus the race. */
const windowOf = (e: RaceEvent): EventWindow =>
  availabilityWindow({ ...e, startsAt: new Date(e.startsAt) });

/** Groups stored blocks into one row per driver, in slot terms. */
function toRows(stored: StoredBlock[], w: EventWindow): AvailabilityRow[] {
  const byUser = new Map<string, AvailabilityRow>();
  for (const b of stored) {
    let row = byUser.get(b.userId);
    if (!row) {
      row = { userId: b.userId, blocks: [], updatedAt: null, updatedBy: null };
      byUser.set(b.userId, row);
    }
    row.blocks.push({ ...intervalToSlotRange(w, b), status: b.status });
    if (!row.updatedAt || b.updatedAt.toISOString() > row.updatedAt) {
      row.updatedAt = b.updatedAt.toISOString();
      row.updatedBy = b.updatedBy;
    }
  }
  return [...byUser.values()];
}

export const availabilityRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requireUser(db));

  app.get('/events/:eventId/availability', async (req): Promise<AvailabilityRow[]> => {
    const eventId = idParam(req.params, 'eventId');
    const { event } = await eventContext(db, eventId, req.user!.id);
    return toRows(await loadAvailability(db, eventId), windowOf(event));
  });

  app.put('/events/:eventId/availability/:userId', async (req): Promise<AvailabilityRow> => {
    const eventId = idParam(req.params, 'eventId');
    const targetId = idParam(req.params, 'userId');
    const { event, membership } = await eventContext(db, eventId, req.user!.id);
    if (targetId !== req.user!.id && !can(membership, 'manageAvailability')) throw forbidden();

    // Only drivers on the event's team have a row.
    const [onTeam] = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, event.teamId), eq(teamMembers.userId, targetId)));
    if (!onTeam) throw conflict(`Only drivers on ${event.teamName} can have availability here`);

    const { blocks } = parseBody(saveAvailabilitySchema, req.body);
    const w = windowOf(event);
    const count = slotCount(w);
    if (blocks.some((b) => b.endSlot > count)) {
      throw new HttpError(400, `This event has ${count} slots; a block goes past the end`);
    }
    const intervals = blocks.map((b) => ({
      ...slotRangeToInterval(w, b.startSlot, b.endSlot),
      status: b.status,
    }));

    try {
      await db.transaction((tx) =>
        replaceAvailability(tx, eventId, targetId, intervals, req.user!.id),
      );
    } catch (err) {
      // Exclusion (overlap) or window/slot check: the request didn't fit the race.
      if (pgCode(err) === '23P01' || pgCode(err) === '23514') {
        throw conflict('That availability doesn’t fit this race; reload and try again');
      }
      throw err;
    }

    const saved = toRows(
      (await loadAvailability(db, eventId)).filter((b) => b.userId === targetId),
      w,
    );
    return saved[0] ?? { userId: targetId, blocks: [], updatedAt: null, updatedBy: null };
  });
};
