import { describe, expect, it } from 'vitest';
import { availabilityDuring, driverTotals, planStints, type StrategySettings } from './plan';
import { blocksToPaint, slotCount, type EventWindow } from './slots';
import type { Pace } from './stints';

// Pure instants: must pass under any machine timezone (CI runs five).
const race: EventWindow = { startsAt: new Date('2026-10-24T12:00:00Z'), durationMinutes: 180 };
const settings: StrategySettings = { fuelCapacity: 100, refuelSeconds: 60, pitLaneLossSeconds: 30 };
const paces: Record<string, Pace> = {
  a: { lapMs: 240_000, consumptionPerLap: 10 }, // 10 laps, 40 min
  b: { lapMs: 242_000, consumptionPerLap: 9 }, // 11 laps, 44 min 22 s
};
const paceFor = (id: string) => paces[id] ?? null;
const iso = (d: Date) => d.toISOString();

describe('planStints', () => {
  it('chains stints and pit stops from the green flag', () => {
    const plan = planStints(race, settings, [{ driverId: 'a' }, { driverId: 'b' }], paceFor, null);
    const [s1, s2] = plan.stints;
    expect(s1).toMatchObject({ laps: 10, lapMs: 240_000, estimated: false, endsAtFlag: false });
    expect(iso(s1!.start)).toBe('2026-10-24T12:00:00.000Z');
    expect(iso(s1!.end)).toBe('2026-10-24T12:40:00.000Z');
    // Stop = 30 s lane + 60 s × (99 % needed by b's 11 laps × 9) = 89.4 s.
    expect(s1!.pitMs).toBe(89_400);
    expect(iso(s2!.start)).toBe('2026-10-24T12:41:29.400Z');
    expect(s2!.laps).toBe(11);
    expect(s2!.pitMs).toBe(0); // nothing follows
    // 40 + 1.49 + 44.37 min ≈ 85.9 min of a 180 min race: the rest is uncovered.
    expect(iso(plan.uncoveredFrom!)).toBe(iso(s2!.end));
    expect(plan.projectedLaps).toBe(21);
  });

  it('ends the stint running at the flag and marks later ones as not needed', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ driverId: i % 2 ? 'b' : 'a' }));
    const plan = planStints(race, settings, many, paceFor, null);
    const atFlag = plan.stints.find((s) => s.endsAtFlag)!;
    expect(iso(atFlag.end)).toBe('2026-10-24T15:00:00.000Z');
    expect(atFlag.pitMs).toBe(0);
    expect(plan.stints.filter((s) => s.afterFlag).length).toBeGreaterThan(0);
    expect(plan.uncoveredFrom).toBeNull();
    // Laps by the flag: full stints plus whole laps of the stint cut short.
    const full = plan.stints
      .filter((s) => !s.endsAtFlag && !s.afterFlag)
      .reduce((n, s) => n + s.laps, 0);
    expect(plan.projectedLaps).toBe(
      full + Math.floor((atFlag.end.getTime() - atFlag.start.getTime()) / atFlag.lapMs),
    );
  });

  it('uses overrides, extra pit time and the team average', () => {
    const avg: Pace = { lapMs: 241_000, consumptionPerLap: 9.5 };
    const plan = planStints(
      race,
      settings,
      [
        { driverId: 'a', lapsOverride: 5, extraPitSeconds: 20 },
        { driverId: 'unknown' },
        { driverId: null, lapsOverride: 2, lapMsOverride: 250_000 },
      ],
      paceFor,
      avg,
    );
    expect(plan.stints[0]).toMatchObject({ laps: 5, estimated: false });
    // Lane 30 + refuel 60 × min(1, 10 laps × 9.5 / 100) + extra 20 = 107 s.
    expect(plan.stints[0]!.pitMs).toBe(107_000);
    expect(plan.stints[1]).toMatchObject({ laps: 10, lapMs: 241_000, estimated: true });
    expect(plan.stints[2]).toMatchObject({ laps: 2, lapMs: 250_000, estimated: false });
  });

  it('stops timing when a stint has no pace at all', () => {
    const plan = planStints(
      race,
      settings,
      [{ driverId: 'a' }, { driverId: 'nobody' }, { driverId: 'b' }],
      paceFor,
      null,
    );
    expect(plan.missingPace).toBe(true);
    expect(plan.stints).toHaveLength(1);
    expect(plan.uncoveredFrom).toBeNull();
  });
});

describe('availabilityDuring', () => {
  const paint = blocksToPaint(
    [
      { startSlot: 0, endSlot: 4, status: 'available' },
      { startSlot: 4, endSlot: 6, status: 'maybe' },
      { startSlot: 8, endSlot: 12, status: 'unavailable' },
    ],
    slotCount(race),
  );
  const at = (min: number) => new Date(race.startsAt.getTime() + min * 60_000);

  it('reports the worst status in the window', () => {
    expect(availabilityDuring(race, paint, at(0), at(60))).toBe('ok');
    expect(availabilityDuring(race, paint, at(50), at(70))).toBe('maybe'); // slots 3-4
    expect(availabilityDuring(race, paint, at(80), at(100))).toBe('maybe'); // maybe beats no answer
    expect(availabilityDuring(race, paint, at(90), at(120))).toBe('none'); // slots 6-7: no answer
    expect(availabilityDuring(race, paint, at(80), at(130))).toBe('unavailable');
    expect(availabilityDuring(race, paint, at(60), at(60))).toBe('ok'); // empty window
  });
});

describe('driverTotals', () => {
  it('sums stints, laps and driving time per driver before the flag', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ driverId: i % 2 ? 'b' : 'a' }));
    const plan = planStints(race, settings, many, paceFor, null);
    const totals = driverTotals(plan);
    const driving = totals.reduce((n, t) => n + t.drivingMs, 0);
    const pits = plan.stints.reduce((n, s) => n + s.pitMs, 0);
    expect(driving + pits).toBe(180 * 60_000); // every minute is either driving or in the pits
    expect(totals.map((t) => t.driverId).sort()).toEqual(['a', 'b']);
  });
});
