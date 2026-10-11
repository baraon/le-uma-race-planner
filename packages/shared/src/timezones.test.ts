import { describe, expect, it } from 'vitest';
import { slotCount, slotStart, type EventWindow } from './slots';
import {
  formatDateTime,
  formatSlotLabel,
  fromZonedInput,
  isValidTimeZone,
  localDayChanged,
  toZonedInput,
  zoneAbbreviation,
  zoneOffsetMinutes,
} from './timezones';

// These tests must pass whatever the machine's own timezone is. CI runs them under several TZ
// values (scripts/test-timezones.mjs), so never use local-time getters like getHours() here.

const race: EventWindow = { startsAt: new Date('2026-09-26T11:00:00Z'), durationMinutes: 600 };

describe('same instant, every zone', () => {
  it('labels the green flag correctly for drivers around the world', () => {
    const flag = slotStart(race, 0);
    expect(formatSlotLabel(flag, 'America/Chicago')).toBe('Sat 06:00');
    expect(formatSlotLabel(flag, 'Europe/Berlin')).toBe('Sat 13:00');
    expect(formatSlotLabel(flag, 'Australia/Sydney')).toBe('Sat 21:00');
    expect(formatSlotLabel(flag, 'Asia/Kolkata')).toBe('Sat 16:30'); // half-hour offset
    expect(formatSlotLabel(flag, 'UTC')).toBe('Sat 11:00');
  });

  it('reports offsets per instant', () => {
    const flag = slotStart(race, 0);
    expect(zoneOffsetMinutes(flag, 'America/Chicago')).toBe(-300);
    expect(zoneOffsetMinutes(flag, 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(flag, 'UTC')).toBe(0);
  });
});

describe('daylight saving', () => {
  // US clocks fall back at 02:00 CDT on 1 Nov 2026 (07:00 UTC): 01:00-02:00 happens twice.
  const fallBack: EventWindow = {
    startsAt: new Date('2026-11-01T05:00:00Z'),
    durationMinutes: 240,
  };

  it('keeps slot count fixed and shows the repeated local hour', () => {
    expect(slotCount(fallBack)).toBe(16);
    const before = slotStart(fallBack, 4); // 06:00 UTC
    const after = slotStart(fallBack, 8); // 07:00 UTC
    expect(formatSlotLabel(before, 'America/Chicago', false)).toBe('01:00');
    expect(formatSlotLabel(after, 'America/Chicago', false)).toBe('01:00');
    expect(zoneAbbreviation(before, 'America/Chicago')).toBe('CDT');
    expect(zoneAbbreviation(after, 'America/Chicago')).toBe('CST');
  });

  // EU clocks spring forward at 01:00 UTC on 29 Mar 2026: Berlin skips 02:00-03:00.
  it('skips the missing local hour in spring', () => {
    const springForward: EventWindow = {
      startsAt: new Date('2026-03-29T00:00:00Z'),
      durationMinutes: 120,
    };
    expect(formatSlotLabel(slotStart(springForward, 3), 'Europe/Berlin', false)).toBe('01:45');
    expect(formatSlotLabel(slotStart(springForward, 4), 'Europe/Berlin', false)).toBe('03:00');
  });
});

describe('day boundaries', () => {
  it('notices when a 24h race crosses local midnight', () => {
    const leMans: EventWindow = {
      startsAt: new Date('2026-06-13T14:00:00Z'),
      durationMinutes: 1440,
    };
    const flag = slotStart(leMans, 0);
    const later = slotStart(leMans, 40); // +10h, 00:00 UTC Sunday
    expect(localDayChanged(flag, later, 'UTC')).toBe(true);
    expect(localDayChanged(flag, later, 'America/Chicago')).toBe(false); // still Sat 19:00
    expect(formatSlotLabel(later, 'America/Chicago')).toBe('Sat 19:00');
  });
});

describe('validation', () => {
  it('accepts IANA names and rejects raw offsets', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('UTC-5')).toBe(false);
    expect(isValidTimeZone('-05:00')).toBe(false);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('entering wall-clock times', () => {
  it('converts a local time in each zone to the same instant', () => {
    const flag = '2026-09-26T11:00:00.000Z';
    expect(fromZonedInput('2026-09-26T06:00', 'America/Chicago').toISOString()).toBe(flag);
    expect(fromZonedInput('2026-09-26T13:00', 'Europe/Berlin').toISOString()).toBe(flag);
    expect(fromZonedInput('2026-09-26T21:00', 'Australia/Sydney').toISOString()).toBe(flag);
    expect(fromZonedInput('2026-09-26T16:30', 'Asia/Kolkata').toISOString()).toBe(flag);
    expect(fromZonedInput('2026-09-26T11:00', 'UTC').toISOString()).toBe(flag);
  });

  it('round-trips through the datetime-local format', () => {
    for (const zone of ['America/Chicago', 'Europe/Berlin', 'Australia/Sydney', 'Asia/Kolkata']) {
      const instant = new Date('2026-11-14T18:15:00Z');
      expect(fromZonedInput(toZonedInput(instant, zone), zone)).toEqual(instant);
    }
  });

  it('picks the first of a repeated hour when clocks go back', () => {
    // Chicago, 1 Nov 2026: 01:30 happens at 06:30 UTC (CDT) and again at 07:30 UTC (CST).
    expect(fromZonedInput('2026-11-01T01:30', 'America/Chicago').toISOString()).toBe(
      '2026-11-01T06:30:00.000Z',
    );
    // Sydney, 5 Apr 2026: 02:30 happens at 15:30 UTC (AEDT) and 16:30 UTC (AEST) the day before.
    expect(fromZonedInput('2026-04-05T02:30', 'Australia/Sydney').toISOString()).toBe(
      '2026-04-04T15:30:00.000Z',
    );
  });

  it('moves a skipped time forward when clocks go forward', () => {
    // Chicago, 8 Mar 2026: 02:00-03:00 doesn't exist; 02:30 becomes 03:30 CDT.
    const t = fromZonedInput('2026-03-08T02:30', 'America/Chicago');
    expect(t.toISOString()).toBe('2026-03-08T08:30:00.000Z');
    expect(toZonedInput(t, 'America/Chicago')).toBe('2026-03-08T03:30');
    // Berlin, 29 Mar 2026: 02:15 becomes 03:15 CEST.
    expect(fromZonedInput('2026-03-29T02:15', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T01:15:00.000Z',
    );
  });

  it('handles times next to local midnight', () => {
    expect(fromZonedInput('2026-12-31T23:45', 'Asia/Kolkata').toISOString()).toBe(
      '2026-12-31T18:15:00.000Z',
    );
    expect(toZonedInput(new Date('2026-12-31T18:45:00Z'), 'Asia/Kolkata')).toBe('2027-01-01T00:15');
  });

  it('formats a full date and time per zone', () => {
    const t = new Date('2026-11-14T18:00:00Z');
    expect(formatDateTime(t, 'America/Chicago')).toBe('Sat 14 Nov 2026, 12:00');
    expect(formatDateTime(t, 'Australia/Sydney')).toBe('Sun 15 Nov 2026, 05:00');
  });

  it('rejects malformed input', () => {
    expect(() => fromZonedInput('2026-11-14 18:00', 'UTC')).toThrow(RangeError);
  });
});
