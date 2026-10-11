import { describe, expect, it } from 'vitest';
import { slotCount, slotStart, type EventWindow } from './slots';
import {
  formatSlotLabel,
  isValidTimeZone,
  localDayChanged,
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
