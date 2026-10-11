/**
 * Slot arithmetic for race events.
 *
 * The rule for the whole app: times are absolute instants (UTC). A race is a start instant plus a
 * duration, cut into fixed slots counted from the green flag. Slot boundaries are the same instants
 * for every driver, whatever their timezone, so nothing in this file knows about timezones.
 */

export const SLOT_MINUTES = 15;
const MINUTE_MS = 60_000;

export const AVAILABILITY_STATUSES = ['available', 'maybe', 'unavailable'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/** One driver's painted row: a status (or null = no answer) per slot. */
export type Paint = readonly (AvailabilityStatus | null)[];

export interface EventWindow {
  /** Green flag, as an absolute instant. */
  startsAt: Date;
  durationMinutes: number;
  slotMinutes?: number;
}

/** A run of slots with one status. `endSlot` is exclusive: [startSlot, endSlot). */
export interface SlotBlock {
  startSlot: number;
  endSlot: number;
  status: AvailabilityStatus;
}

/** A half-open time interval [start, end). */
export interface Interval {
  start: Date;
  end: Date;
}

const slotLength = (w: EventWindow): number => w.slotMinutes ?? SLOT_MINUTES;

export function eventEnd(w: EventWindow): Date {
  return new Date(w.startsAt.getTime() + w.durationMinutes * MINUTE_MS);
}

/** Number of slots in the event. A final partial slot counts as a slot. */
export function slotCount(w: EventWindow): number {
  return Math.ceil(w.durationMinutes / slotLength(w));
}

/**
 * The instant slot `index` begins. `index === slotCount` returns the event end, so
 * `slotStart(w, i + 1)` is always the end of slot `i`.
 */
export function slotStart(w: EventWindow, index: number): Date {
  const count = slotCount(w);
  if (!Number.isInteger(index) || index < 0 || index > count) {
    throw new RangeError(`Slot index ${index} is outside 0..${count}`);
  }
  const ms = w.startsAt.getTime() + index * slotLength(w) * MINUTE_MS;
  return new Date(Math.min(ms, eventEnd(w).getTime()));
}

/** Which slot contains `instant`, or null when it falls outside the race. */
export function slotIndexAt(w: EventWindow, instant: Date): number | null {
  const offset = instant.getTime() - w.startsAt.getTime();
  if (offset < 0 || instant.getTime() >= eventEnd(w).getTime()) return null;
  return Math.floor(offset / (slotLength(w) * MINUTE_MS));
}

export function slotRangeToInterval(w: EventWindow, startSlot: number, endSlot: number): Interval {
  if (endSlot <= startSlot) throw new RangeError('endSlot must be greater than startSlot');
  return { start: slotStart(w, startSlot), end: slotStart(w, endSlot) };
}

/** Inverse of slotRangeToInterval. Throws if the interval isn't on slot boundaries. */
export function intervalToSlotRange(
  w: EventWindow,
  interval: Interval,
): { startSlot: number; endSlot: number } {
  const step = slotLength(w) * MINUTE_MS;
  const toSlot = (d: Date): number => {
    if (d.getTime() === eventEnd(w).getTime()) return slotCount(w);
    const offset = d.getTime() - w.startsAt.getTime();
    if (offset < 0 || offset % step !== 0) {
      throw new RangeError(`${d.toISOString()} is not on a slot boundary`);
    }
    return offset / step;
  };
  const startSlot = toSlot(interval.start);
  const endSlot = toSlot(interval.end);
  if (endSlot <= startSlot || endSlot > slotCount(w)) {
    throw new RangeError('Interval is empty or outside the event');
  }
  return { startSlot, endSlot };
}

/** Collapse a painted row into blocks: consecutive slots with the same status merge. */
export function paintToBlocks(paint: Paint): SlotBlock[] {
  const blocks: SlotBlock[] = [];
  let current: SlotBlock | null = null;
  paint.forEach((status, i) => {
    if (current && current.status === status) {
      current.endSlot = i + 1;
      return;
    }
    if (current) blocks.push(current);
    current = status ? { startSlot: i, endSlot: i + 1, status } : null;
  });
  if (current) blocks.push(current);
  return blocks;
}

/** Expand blocks back into a painted row of length `count`. */
export function blocksToPaint(
  blocks: readonly SlotBlock[],
  count: number,
): (AvailabilityStatus | null)[] {
  const paint: (AvailabilityStatus | null)[] = Array.from({ length: count }, () => null);
  for (const b of blocks) {
    for (let i = Math.max(0, b.startSlot); i < Math.min(count, b.endSlot); i++) paint[i] = b.status;
  }
  return paint;
}

/** True when no two blocks share a slot. */
export function blocksOverlap(blocks: readonly SlotBlock[]): boolean {
  const sorted = [...blocks].sort((a, b) => a.startSlot - b.startSlot);
  return sorted.some((b, i) => i > 0 && b.startSlot < sorted.at(i - 1)!.endSlot);
}

/** Per slot, how many drivers marked themselves Available. */
export function coverage(rows: readonly Paint[], count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    rows.reduce((n, row) => n + (row[i] === 'available' ? 1 : 0), 0),
  );
}

/**
 * For when an event moves or changes length: keeps the parts of each interval that fall inside
 * the new window, shrunk inward to whole slots of the new grid (a block may still end at the
 * flag). Availability means "these real-world times", so the instants stay put; anything that
 * no longer covers a whole slot is dropped.
 */
export function clipToWindow<T extends Interval>(intervals: readonly T[], w: EventWindow): T[] {
  const step = slotLength(w) * MINUTE_MS;
  const start = w.startsAt.getTime();
  const end = eventEnd(w).getTime();
  return intervals.flatMap((iv) => {
    const a = Math.max(iv.start.getTime(), start);
    const b = Math.min(iv.end.getTime(), end);
    const snappedStart = start + Math.ceil((a - start) / step) * step;
    const snappedEnd = b === end ? end : start + Math.floor((b - start) / step) * step;
    return snappedStart < snappedEnd
      ? [{ ...iv, start: new Date(snappedStart), end: new Date(snappedEnd) }]
      : [];
  });
}

export interface CoverageGap {
  startSlot: number;
  /** Exclusive. */
  endSlot: number;
  /** The fewest available drivers in any slot of the gap. */
  fewest: number;
}

/** Runs of consecutive slots where fewer than `needed` drivers are available. */
export function coverageGaps(counts: readonly number[], needed: number): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  counts.forEach((n, i) => {
    const last = gaps.at(-1);
    if (n >= needed) return;
    if (last && last.endSlot === i) {
      last.endSlot = i + 1;
      last.fewest = Math.min(last.fewest, n);
    } else {
      gaps.push({ startSlot: i, endSlot: i + 1, fewest: n });
    }
  });
  return gaps;
}
