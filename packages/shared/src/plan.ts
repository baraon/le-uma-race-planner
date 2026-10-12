/**
 * The stint plan calculator. Given the race window, the event's strategy settings and an ordered
 * list of stints, it works out every stint's laps, exact start/end instants and the pit stop that
 * follows. Everything is a user-supplied variable (CLAUDE.md rule 6). Stints are exact instants,
 * not slot-aligned (rule 2); availability is checked by overlaying them on the slot grid.
 */
import {
  eventEnd,
  slotCount,
  slotIndexAt,
  type AvailabilityStatus,
  type EventWindow,
  type Paint,
} from './slots';
import { lapsPerStint, type Pace } from './stints';

export interface StrategySettings {
  /** Usable energy (%) or tank size (litres). */
  fuelCapacity: number;
  /** Seconds to refuel from empty to full. */
  refuelSeconds: number;
  /** Seconds lost driving through the pit lane. */
  pitLaneLossSeconds: number;
}

export interface StintInput {
  driverId: string | null;
  lapsOverride?: number | null;
  lapMsOverride?: number | null;
  /** Extra seconds in the stop after this stint (repairs, driver change, ...). */
  extraPitSeconds?: number;
}

export interface PlannedStint {
  index: number;
  driverId: string | null;
  laps: number;
  lapMs: number;
  /** Fuel or energy this stint needs: laps × use per lap (capped at capacity). */
  fuelNeeded: number;
  start: Date;
  /** When the stint ends: its last lap, or the flag if the race ends first. */
  end: Date;
  /** Length of the pit stop after this stint, in ms (0 for the last stint that runs). */
  pitMs: number;
  /** Pace came from the team average (no numbers for this driver, or no driver). */
  estimated: boolean;
  /** The flag falls during this stint. */
  endsAtFlag: boolean;
  /** Starts at or after the flag: not needed. */
  afterFlag: boolean;
}

export interface PlanResult {
  stints: PlannedStint[];
  /** When the last stint (or its stop) ends, if before the flag; null if the plan reaches it. */
  uncoveredFrom: Date | null;
  /** Laps completed by the flag (whole laps), over the stints that run. */
  projectedLaps: number;
  /** True when no pace exists at all, so stints without overrides can't be timed. */
  missingPace: boolean;
}

/**
 * Plans the stints in order. `paceFor` returns a driver's own pace or null; `average` is the team
 * average used for drivers without numbers (and unassigned stints).
 */
export function planStints(
  w: EventWindow,
  settings: StrategySettings,
  inputs: readonly StintInput[],
  paceFor: (driverId: string) => Pace | null,
  average: Pace | null,
): PlanResult {
  const flag = eventEnd(w).getTime();
  const resolved = inputs.map((s) => {
    const own = s.driverId ? paceFor(s.driverId) : null;
    const pace = own ?? average;
    const lapMs = s.lapMsOverride ?? pace?.lapMs ?? null;
    const laps =
      s.lapsOverride ?? (pace ? lapsPerStint(settings.fuelCapacity, pace.consumptionPerLap) : null);
    const fuelNeeded =
      pace && laps
        ? Math.min(settings.fuelCapacity, laps * pace.consumptionPerLap)
        : settings.fuelCapacity;
    return { s, own, lapMs, laps, fuelNeeded };
  });

  const stints: PlannedStint[] = [];
  let t = w.startsAt.getTime();
  let projectedLaps = 0;
  let missingPace = false;

  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i]!;
    if (r.lapMs === null || r.laps === null) {
      missingPace = true;
      break; // later stints can't be timed without this one
    }
    const afterFlag = t >= flag;
    const naturalEnd = t + r.laps * r.lapMs;
    const endsAtFlag = !afterFlag && naturalEnd >= flag;
    const end = afterFlag ? t : Math.min(naturalEnd, flag);
    if (!afterFlag) {
      projectedLaps += endsAtFlag ? Math.floor((flag - t) / r.lapMs) : r.laps;
    }

    // Stop after this stint: only if another stint follows and the race is still on.
    const next = resolved[i + 1];
    const stops = !afterFlag && !endsAtFlag && next !== undefined;
    const refuelShare = next ? Math.min(1, next.fuelNeeded / settings.fuelCapacity) : 0;
    const pitMs = stops
      ? Math.round(
          (settings.pitLaneLossSeconds +
            settings.refuelSeconds * refuelShare +
            (r.s.extraPitSeconds ?? 0)) *
            1000,
        )
      : 0;

    stints.push({
      index: i,
      driverId: r.s.driverId,
      laps: r.laps,
      lapMs: r.lapMs,
      fuelNeeded: r.fuelNeeded,
      start: new Date(t),
      end: new Date(end),
      pitMs,
      estimated: r.own === null && (r.s.lapMsOverride == null || r.s.lapsOverride == null),
      endsAtFlag,
      afterFlag,
    });
    t = end + pitMs;
  }

  const last = stints.at(-1);
  const reachesFlag = last !== undefined && (last.endsAtFlag || last.afterFlag);
  // Where the plan stops short of the flag (unknown when a stint can't be timed).
  const uncoveredFrom =
    reachesFlag || missingPace ? null : new Date(last ? last.end.getTime() : w.startsAt.getTime());
  return { stints, uncoveredFrom, projectedLaps, missingPace };
}

const SEVERITY: Record<'ok' | 'none' | 'maybe' | 'unavailable', number> = {
  ok: 0,
  none: 1,
  maybe: 2,
  unavailable: 3,
};
export type StintAvailability = keyof typeof SEVERITY;

/**
 * The worst availability a driver marked during [start, end): "unavailable" beats "maybe" beats
 * "none" (no answer) beats "ok" (available throughout). Checked on the 15-minute slot grid.
 */
export function availabilityDuring(
  w: EventWindow,
  paint: Paint,
  start: Date,
  end: Date,
): StintAvailability {
  const first = slotIndexAt(w, start);
  if (first === null || end <= start) return 'ok';
  const lastInstant = new Date(end.getTime() - 1);
  const last = slotIndexAt(w, lastInstant) ?? slotCount(w) - 1;
  let worst: StintAvailability = 'ok';
  for (let i = first; i <= last; i++) {
    const s: AvailabilityStatus | null = paint[i] ?? null;
    const here: StintAvailability = s === null ? 'none' : s === 'available' ? 'ok' : s;
    if (SEVERITY[here] > SEVERITY[worst]) worst = here;
  }
  return worst;
}

export interface DriverTotals {
  driverId: string;
  stints: number;
  laps: number;
  drivingMs: number;
}

/** Stints, laps and driving time per driver, over the stints that run before the flag. */
export function driverTotals(plan: PlanResult): DriverTotals[] {
  const byDriver = new Map<string, DriverTotals>();
  for (const s of plan.stints) {
    if (!s.driverId || s.afterFlag) continue;
    const t = byDriver.get(s.driverId) ?? {
      driverId: s.driverId,
      stints: 0,
      laps: 0,
      drivingMs: 0,
    };
    t.stints += 1;
    t.laps += s.endsAtFlag ? Math.floor((s.end.getTime() - s.start.getTime()) / s.lapMs) : s.laps;
    t.drivingMs += s.end.getTime() - s.start.getTime();
    byDriver.set(s.driverId, t);
  }
  return [...byDriver.values()].sort((a, b) => b.drivingMs - a.drivingMs);
}
