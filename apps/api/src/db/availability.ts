/**
 * Availability storage: one row per run of same-status time for a driver, as a half-open
 * tstzrange. The API speaks slot blocks; conversion happens in the routes with @lmu/shared.
 */
import { clipToWindow, type AvailabilityStatus, type EventWindow } from '@lmu/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { availability } from './schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface StoredBlock {
  userId: string;
  start: Date;
  end: Date;
  status: AvailabilityStatus;
  updatedBy: string | null;
  updatedAt: Date;
}

const toRange = (start: Date, end: Date) => `[${start.toISOString()},${end.toISOString()})`;

export async function loadAvailability(db: DbOrTx, eventId: string): Promise<StoredBlock[]> {
  const rows = await db
    .select({
      userId: availability.userId,
      start: sql<string>`lower(${availability.period})`,
      end: sql<string>`upper(${availability.period})`,
      status: availability.status,
      updatedBy: availability.updatedBy,
      updatedAt: availability.updatedAt,
    })
    .from(availability)
    .where(eq(availability.eventId, eventId))
    .orderBy(asc(availability.userId), asc(sql`lower(${availability.period})`));
  return rows.map((r) => ({ ...r, start: new Date(r.start), end: new Date(r.end) }));
}

/** Replaces one driver's whole row for an event. Call inside a transaction. */
export async function replaceAvailability(
  tx: Tx,
  eventId: string,
  userId: string,
  blocks: { start: Date; end: Date; status: AvailabilityStatus }[],
  updatedBy: string,
): Promise<void> {
  await tx
    .delete(availability)
    .where(and(eq(availability.eventId, eventId), eq(availability.userId, userId)));
  if (blocks.length === 0) return;
  await tx.insert(availability).values(
    blocks.map((b) => ({
      eventId,
      userId,
      period: toRange(b.start, b.end),
      status: b.status,
      updatedBy,
    })),
  );
}

/**
 * After an event moves or changes length: keep everyone's availability at the same real-world
 * times, trimmed to the new window and slot grid. Call inside the transaction that updated the
 * event; the database re-checks the result at commit.
 */
export async function clipAvailabilityToEvent(
  tx: Tx,
  eventId: string,
  window: EventWindow,
): Promise<void> {
  const before = await loadAvailability(tx, eventId);
  if (before.length === 0) return;
  const after = clipToWindow(before, window);
  await tx.delete(availability).where(eq(availability.eventId, eventId));
  if (after.length === 0) return;
  await tx.insert(availability).values(
    after.map((b) => ({
      eventId,
      userId: b.userId,
      period: toRange(b.start, b.end),
      status: b.status,
      updatedBy: b.updatedBy,
      updatedAt: b.updatedAt,
    })),
  );
}
