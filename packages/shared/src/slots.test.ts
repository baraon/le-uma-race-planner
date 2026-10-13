import { describe, expect, it } from 'vitest';
import {
  availabilityWindow,
  clipToWindow,
  blocksOverlap,
  blocksToPaint,
  coverage,
  eventEnd,
  intervalToSlotRange,
  paintToBlocks,
  qualifyingSlots,
  slotCount,
  slotIndexAt,
  slotRangeToInterval,
  slotStart,
  type EventWindow,
  type Paint,
} from './slots';

// Petit Le Mans-style event: 600 minutes from 11:00 UTC (06:00 in Chicago).
const race: EventWindow = { startsAt: new Date('2026-09-26T11:00:00Z'), durationMinutes: 600 };

describe('slot arithmetic', () => {
  it('cuts a 600-minute race into 40 fifteen-minute slots', () => {
    expect(slotCount(race)).toBe(40);
    expect(eventEnd(race).toISOString()).toBe('2026-09-26T21:00:00.000Z');
  });

  it('maps slot indexes to instants and back', () => {
    expect(slotStart(race, 0).toISOString()).toBe('2026-09-26T11:00:00.000Z');
    expect(slotStart(race, 1).toISOString()).toBe('2026-09-26T11:15:00.000Z');
    expect(slotStart(race, 40).toISOString()).toBe('2026-09-26T21:00:00.000Z');
    expect(slotIndexAt(race, new Date('2026-09-26T11:14:59Z'))).toBe(0);
    expect(slotIndexAt(race, new Date('2026-09-26T11:15:00Z'))).toBe(1);
    expect(slotIndexAt(race, new Date('2026-09-26T10:59:59Z'))).toBeNull();
    expect(slotIndexAt(race, new Date('2026-09-26T21:00:00Z'))).toBeNull();
  });

  it('treats a final partial slot as a slot ending at the flag', () => {
    const odd: EventWindow = { startsAt: race.startsAt, durationMinutes: 641 };
    expect(slotCount(odd)).toBe(43);
    expect(slotStart(odd, 43).toISOString()).toBe('2026-09-26T21:41:00.000Z');
    expect(intervalToSlotRange(odd, slotRangeToInterval(odd, 40, 43))).toEqual({
      startSlot: 40,
      endSlot: 43,
    });
  });

  it('rejects intervals that are not on slot boundaries', () => {
    expect(() =>
      intervalToSlotRange(race, {
        start: new Date('2026-09-26T11:05:00Z'),
        end: new Date('2026-09-26T12:00:00Z'),
      }),
    ).toThrow(RangeError);
    expect(() => slotStart(race, 41)).toThrow(RangeError);
  });
});

describe('painting', () => {
  const paint: Paint = ['available', 'available', null, 'maybe', 'maybe', 'unavailable', null];

  it('merges consecutive equal statuses into blocks and expands them back', () => {
    const blocks = paintToBlocks(paint);
    expect(blocks).toEqual([
      { startSlot: 0, endSlot: 2, status: 'available' },
      { startSlot: 3, endSlot: 5, status: 'maybe' },
      { startSlot: 5, endSlot: 6, status: 'unavailable' },
    ]);
    expect(blocksToPaint(blocks, paint.length)).toEqual(paint);
    expect(blocksOverlap(blocks)).toBe(false);
  });

  it('detects overlapping blocks', () => {
    expect(
      blocksOverlap([
        { startSlot: 0, endSlot: 4, status: 'available' },
        { startSlot: 3, endSlot: 5, status: 'maybe' },
      ]),
    ).toBe(true);
  });

  it('counts available drivers per slot', () => {
    const other: Paint = ['available', null, 'available', 'available', null, null, null];
    expect(coverage([paint, other], 7)).toEqual([2, 1, 1, 1, 0, 0, 0]);
  });
});

describe('moving an event', () => {
  const at = (iso: string) => new Date(iso);
  const block = (start: string, end: string) => ({
    start: at(start),
    end: at(end),
    status: 'available' as const,
  });

  it('keeps the same real-world times when the race moves by whole slots', () => {
    const moved: EventWindow = { startsAt: at('2026-11-14T17:00:00Z'), durationMinutes: 360 };
    const kept = clipToWindow([block('2026-11-14T18:00:00Z', '2026-11-14T20:00:00Z')], moved);
    expect(kept).toEqual([block('2026-11-14T18:00:00Z', '2026-11-14T20:00:00Z')]);
  });

  it('trims to the new window and drops what falls outside', () => {
    const shorter: EventWindow = { startsAt: at('2026-11-14T18:00:00Z'), durationMinutes: 120 };
    expect(
      clipToWindow(
        [
          block('2026-11-14T19:00:00Z', '2026-11-14T22:00:00Z'),
          block('2026-11-14T22:00:00Z', '2026-11-14T23:00:00Z'),
        ],
        shorter,
      ),
    ).toEqual([block('2026-11-14T19:00:00Z', '2026-11-14T20:00:00Z')]);
  });

  it('shrinks to whole slots when the start moves off the old grid', () => {
    const offGrid: EventWindow = { startsAt: at('2026-11-14T18:05:00Z'), durationMinutes: 360 };
    // 18:00-19:00 now covers only the slots 18:05-18:50; 18:50-19:00 is part of a slot.
    expect(clipToWindow([block('2026-11-14T18:00:00Z', '2026-11-14T19:00:00Z')], offGrid)).toEqual([
      block('2026-11-14T18:05:00Z', '2026-11-14T18:50:00Z'),
    ]);
    // Less than one whole slot left: dropped.
    expect(clipToWindow([block('2026-11-14T18:00:00Z', '2026-11-14T18:15:00Z')], offGrid)).toEqual(
      [],
    );
  });

  it('can still end at a flag that is not on the slot grid', () => {
    const partial: EventWindow = { startsAt: at('2026-11-14T18:00:00Z'), durationMinutes: 100 };
    expect(clipToWindow([block('2026-11-14T19:00:00Z', '2026-11-14T21:00:00Z')], partial)).toEqual([
      block('2026-11-14T19:00:00Z', '2026-11-14T19:40:00Z'),
    ]);
  });
});

describe('availabilityWindow', () => {
  it('is the race itself without qualifying', () => {
    expect(availabilityWindow({ ...race, qualifyingMinutes: 0 })).toEqual(race);
  });

  it('opens earlier by the qualifying length and keeps the grid on the green flag', () => {
    const w = availabilityWindow({ ...race, qualifyingMinutes: 60 });
    expect(w.startsAt.toISOString()).toBe('2026-09-26T10:00:00.000Z');
    expect(slotCount(w)).toBe(44);
    expect(qualifyingSlots({ qualifyingMinutes: 60 })).toBe(4);
    // The first race slot is the green flag; the end doesn't move.
    expect(slotStart(w, 4)).toEqual(race.startsAt);
    expect(eventEnd(w)).toEqual(eventEnd(race));
  });
});
