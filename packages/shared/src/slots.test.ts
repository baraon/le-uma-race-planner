import { describe, expect, it } from 'vitest';
import {
  blocksOverlap,
  blocksToPaint,
  coverage,
  eventEnd,
  intervalToSlotRange,
  paintToBlocks,
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
