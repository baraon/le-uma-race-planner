import { describe, expect, it } from 'vitest';
import { coverageGaps, type EventWindow } from './slots';
import { axisMarks } from './timeline';

// Must pass whatever the machine's timezone is (CI runs these under five TZ values).

describe('axis marks', () => {
  // 24 h from Sat 24 Oct 2026 12:00 UTC: Europe's clocks go back at 01:00 UTC on Sunday.
  const leMans: EventWindow = { startsAt: new Date('2026-10-24T12:00:00Z'), durationMinutes: 1440 };

  it('marks local midnight and the clock change for a European viewer', () => {
    const marks = axisMarks(leMans, 'Europe/Berlin');
    // Midnight in Berlin (CEST) is 22:00 UTC: slot 40.
    expect(marks.days).toEqual([{ slot: 40, label: 'Sun 25 Oct' }]);
    // 01:00 UTC: slot 52, clocks go back an hour.
    expect(marks.clockChanges).toEqual([
      { slot: 52, deltaMinutes: -60, from: 'GMT+2', to: 'GMT+1' },
    ]);
    expect(marks.ticks[0]).toEqual({ slot: 0, label: 'Sat 14:00' });
  });

  it('shows no clock change for a zone without one that night', () => {
    const marks = axisMarks(leMans, 'America/Chicago');
    expect(marks.clockChanges).toEqual([]);
    // Midnight in Chicago (CDT) is 05:00 UTC: slot 68.
    expect(marks.days).toEqual([{ slot: 68, label: 'Sun 25 Oct' }]);
  });

  it('handles half-hour zones and the US change a week later', () => {
    const kolkata = axisMarks(leMans, 'Asia/Kolkata');
    // Midnight in India is 18:30 UTC: slot 26.
    expect(kolkata.days).toEqual([{ slot: 26, label: 'Sun 25 Oct' }]);

    const usFallBack: EventWindow = {
      startsAt: new Date('2026-11-01T04:00:00Z'),
      durationMinutes: 360,
    };
    const chicago = axisMarks(usFallBack, 'America/Chicago');
    // 07:00 UTC: slot 12, CDT → CST.
    expect(chicago.clockChanges).toEqual([{ slot: 12, deltaMinutes: -60, from: 'CDT', to: 'CST' }]);
  });

  it('labels a sub-range of the race with its own first tick', () => {
    const marks = axisMarks(leMans, 'UTC', 24, 48);
    expect(marks.ticks.map((t) => t.label)).toEqual([
      'Sat 18:00',
      '19:00',
      '20:00',
      '21:00',
      '22:00',
      '23:00',
    ]);
    expect(marks.days).toEqual([]);
    expect(axisMarks(leMans, 'UTC', 48, 72).days).toEqual([{ slot: 48, label: 'Sun 25 Oct' }]);
  });
});

describe('coverage gaps', () => {
  it('finds runs below the number of drivers needed', () => {
    expect(coverageGaps([2, 2, 1, 0, 1, 2, 0], 2)).toEqual([
      { startSlot: 2, endSlot: 5, fewest: 0 },
      { startSlot: 6, endSlot: 7, fewest: 0 },
    ]);
    expect(coverageGaps([1, 1, 1], 1)).toEqual([]);
  });
});
