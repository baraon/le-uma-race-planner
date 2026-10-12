import { describe, expect, it } from 'vitest';
import { FILL_DEFAULTS, suggestStints } from './fill';
import { availabilityDuring, driverTotals, planStints, type StrategySettings } from './plan';
import {
  blocksToPaint,
  slotCount,
  type AvailabilityStatus,
  type EventWindow,
  type SlotBlock,
} from './slots';
import type { Pace } from './stints';

// Pure instants and slot maths: must pass under any machine timezone (CI runs five).
const race: EventWindow = { startsAt: new Date('2026-10-24T12:00:00Z'), durationMinutes: 1440 };
const settings: StrategySettings = { fuelCapacity: 100, refuelSeconds: 60, pitLaneLossSeconds: 30 };
const count = slotCount(race);
const pace: Record<string, Pace> = {
  a: { lapMs: 240_000, consumptionPerLap: 10 },
  b: { lapMs: 242_000, consumptionPerLap: 9.6 },
  c: { lapMs: 244_000, consumptionPerLap: 9.8 },
};
const paceFor = (id: string) => pace[id] ?? null;
const all = (status: AvailabilityStatus): SlotBlock[] => [{ startSlot: 0, endSlot: count, status }];
const paints = (blocks: Record<string, SlotBlock[]>) => (id: string) =>
  blocksToPaint(blocks[id] ?? [], count);

function fill(
  blocks: Record<string, SlotBlock[]>,
  options = FILL_DEFAULTS,
  existing: { driverId: string | null }[] = [],
  drivers = ['a', 'b', 'c'],
) {
  const paintFor = paints(blocks);
  const added = suggestStints(race, settings, existing, drivers, paceFor, null, paintFor, options);
  const stints = [...existing, ...added];
  const plan = planStints(race, settings, stints, paceFor, null);
  const statuses = plan.stints
    .filter((s) => !s.afterFlag)
    .map((s) => availabilityDuring(race, paintFor(s.driverId!), s.start, s.end));
  return { added, order: stints.map((s) => s.driverId).join(''), plan, statuses };
}

describe('suggestStints', () => {
  it('covers the race with double stints and rest between runs', () => {
    const { order, plan } = fill({ a: all('available'), b: all('available'), c: all('available') });
    expect(plan.uncoveredFrom).toBeNull();
    expect(plan.stints.some((s) => s.afterFlag)).toBe(false); // stops at the flag, no spare stints
    expect(order.startsWith('aabbccaabbcc')).toBe(true);
    // Nobody drives three in a row or returns before two stints of rest.
    expect(order).not.toMatch(/(.)\1\1/);
    expect(order).not.toMatch(/a[bc]a|b[ac]b|c[ab]c/);
  });

  it('keeps driving time even', () => {
    const { plan } = fill({ a: all('available'), b: all('available'), c: all('available') });
    const totals = driverTotals(plan);
    const total = totals.reduce((n, t) => n + t.drivingMs, 0);
    for (const t of totals) expect(t.drivingMs / total).toBeGreaterThan(0.28);
    for (const t of totals) expect(t.drivingMs / total).toBeLessThan(0.39);
  });

  it('never uses an unavailable driver while someone else can drive', () => {
    // a can't drive the first 12 hours, b the last 12; c is always free.
    const { statuses, plan } = fill({
      a: [
        { startSlot: 0, endSlot: 48, status: 'unavailable' },
        { startSlot: 48, endSlot: 96, status: 'available' },
      ],
      b: [
        { startSlot: 0, endSlot: 48, status: 'available' },
        { startSlot: 48, endSlot: 96, status: 'unavailable' },
      ],
      c: all('available'),
    });
    expect(plan.uncoveredFrom).toBeNull();
    expect(statuses).not.toContain('unavailable');
  });

  it('prefers an available driver over maybe or no answer, but still finishes the plan', () => {
    const { statuses } = fill({ a: all('available'), b: all('maybe'), c: [] });
    // With one clean driver, rest and run limits force some maybes / no answers, never a gap.
    expect(statuses.filter((s) => s === 'ok').length).toBeGreaterThan(statuses.length / 3);
    const never = fill(
      { a: all('available'), b: all('maybe'), c: [] },
      { ...FILL_DEFAULTS, maybe: 'never', noAnswer: 'never' },
    );
    expect(never.plan.uncoveredFrom).toBeNull();
    expect(never.statuses.filter((s) => s === 'ok').length).toBeGreaterThan(
      statuses.filter((s) => s === 'ok').length,
    );
  });

  it('uses the least bad driver when nobody is available, instead of leaving a gap', () => {
    const { plan, statuses } = fill({
      a: all('unavailable'),
      b: all('unavailable'),
      c: all('unavailable'),
    });
    expect(plan.uncoveredFrom).toBeNull();
    expect(new Set(statuses)).toEqual(new Set(['unavailable']));
  });

  it('continues after existing stints without changing them', () => {
    const existing = [{ driverId: 'c' }, { driverId: 'b' }];
    const { added, order } = fill(
      { a: all('available'), b: all('available'), c: all('available') },
      FILL_DEFAULTS,
      existing,
    );
    expect(order.startsWith('cb')).toBe(true);
    // b has done one stint of its run, so it gets the second; then the least-driven driver.
    expect(order.slice(2, 5)).toBe('baa');
    expect(added.length).toBe(order.length - 2);
  });

  it('adds nothing when the plan already reaches the flag, or can’t be timed', () => {
    const full = fill({ a: all('available'), b: all('available'), c: all('available') });
    const again = suggestStints(
      race,
      settings,
      full.plan.stints.map((s) => ({ driverId: s.driverId })),
      ['a', 'b', 'c'],
      paceFor,
      null,
      paints({}),
      FILL_DEFAULTS,
    );
    expect(again).toEqual([]);
    expect(
      suggestStints(race, settings, [], ['x', 'y'], () => null, null, paints({}), FILL_DEFAULTS),
    ).toEqual([]);
    expect(suggestStints(race, settings, [], [], paceFor, null, paints({}), FILL_DEFAULTS)).toEqual(
      [],
    );
  });

  it('gives quicker drivers more time when asked to', () => {
    const blocks = { a: all('available'), b: all('available'), c: all('available') };
    const share = (id: string, options = FILL_DEFAULTS) => {
      const { plan } = fill(blocks, options);
      const totals = driverTotals(plan);
      return (
        totals.find((t) => t.driverId === id)!.drivingMs /
        totals.reduce((n, t) => n + t.drivingMs, 0)
      );
    };
    expect(share('a', { ...FILL_DEFAULTS, balance: 'faster' })).toBeGreaterThan(share('a'));
    expect(share('c', { ...FILL_DEFAULTS, balance: 'faster' })).toBeLessThan(share('c'));
  });

  it('respects the run length option', () => {
    const blocks = { a: all('available'), b: all('available'), c: all('available') };
    expect(
      fill(blocks, { ...FILL_DEFAULTS, stintsInARow: 1, minRestStints: 1 }).order.startsWith(
        'abcabc',
      ),
    ).toBe(true);
    expect(fill(blocks, { ...FILL_DEFAULTS, stintsInARow: 3 }).order.startsWith('aaabbbccc')).toBe(
      true,
    );
  });
});
