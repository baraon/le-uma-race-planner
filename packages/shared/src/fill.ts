/**
 * "Fill to the flag": suggests who drives the stints still missing from a plan. It never changes
 * stints that are already there; it continues after them.
 *
 * Greedy, one stint at a time: every driver is tried for the next stint (timed with their own
 * pace), scored, and the best one is taken. It is a suggestion, not an optimiser: when no choice
 * is clean the least bad driver is used and the plan's status icons show the conflict. Every
 * weight below is a preference, and the options are user-editable (CLAUDE.md rule 6).
 */
import {
  availabilityDuring,
  driverTotals,
  planStints,
  type StintInput,
  type StrategySettings,
} from './plan';
import type { EventWindow, Paint } from './slots';
import type { Pace } from './stints';

export interface FillOptions {
  /** Preferred run length: how many stints a driver does back to back (2 = double stints). */
  stintsInARow: number;
  /** Stints a driver sits out between runs, at least. */
  minRestStints: number;
  /** "avoid" = use only when it's the better choice; "never" = don't use unless nobody else can. */
  maybe: 'avoid' | 'never';
  noAnswer: 'avoid' | 'never';
  /** "equal" evens out driving time; "faster" lets quicker drivers do more of it. */
  balance: 'equal' | 'faster';
}

export const FILL_DEFAULTS: FillOptions = {
  stintsInARow: 2,
  minRestStints: 2,
  maybe: 'avoid',
  noAnswer: 'avoid',
  balance: 'equal',
};

// Scores (lower is better). Availability dominates, then run length and rest, then fairness.
const NOT_AVAILABLE = 1000;
const NEVER = 400;
const MAYBE = 60;
const NO_ANSWER = 40;
const RUN_TOO_LONG = 200;
const CONTINUE_RUN = -30;
const MISSING_REST = 80; // per stint of rest still owed
const AHEAD_BY_A_STINT = 15; // per stint-length of driving ahead of the least-driven driver
const SECOND_SLOWER = 10; // "faster" balance: per second a lap slower than the quickest driver
const MAX_STINTS = 300;

/**
 * Returns the stints to append so the plan reaches the flag (empty if it already does, if there
 * are no drivers, or if stints can't be timed because nobody has pace).
 */
export function suggestStints(
  w: EventWindow,
  settings: StrategySettings,
  existing: readonly StintInput[],
  drivers: readonly string[],
  paceFor: (driverId: string) => Pace | null,
  average: Pace | null,
  paintFor: (driverId: string) => Paint,
  options: FillOptions = FILL_DEFAULTS,
): StintInput[] {
  if (drivers.length === 0) return [];
  const plan: StintInput[] = [...existing];
  const added: StintInput[] = [];
  const lapOf = (id: string) => (paceFor(id) ?? average)?.lapMs ?? null;
  const laps = drivers.map(lapOf).filter((ms): ms is number => ms !== null);
  const quickest = laps.length > 0 ? Math.min(...laps) : null;

  while (plan.length < MAX_STINTS) {
    const now = planStints(w, settings, plan, paceFor, average);
    if (now.missingPace || now.uncoveredFrom === null) break;

    const run = now.stints.filter((s) => !s.afterFlag);
    const lastDriver = run.at(-1)?.driverId ?? null;
    let runLength = 0;
    for (let i = run.length - 1; i >= 0 && run[i]!.driverId === lastDriver; i--) runLength++;
    const driven = new Map(driverTotals(now).map((t) => [t.driverId, t.drivingMs]));
    const least = Math.min(...drivers.map((d) => driven.get(d) ?? 0));
    /** Stints since this driver last drove (Infinity if they haven't yet). */
    const restSince = (id: string) => {
      const last = run.findLastIndex((s) => s.driverId === id);
      return last === -1 ? Infinity : run.length - 1 - last;
    };

    let best: { id: string; score: number } | null = null;
    for (const id of drivers) {
      const trial = planStints(w, settings, [...plan, { driverId: id }], paceFor, average);
      const stint = trial.stints[plan.length];
      if (!stint) continue; // can't be timed
      const length = Math.max(1, stint.end.getTime() - stint.start.getTime());

      const status = availabilityDuring(w, paintFor(id), stint.start, stint.end);
      let score =
        status === 'unavailable'
          ? NOT_AVAILABLE
          : status === 'maybe'
            ? options.maybe === 'never'
              ? NEVER
              : MAYBE
            : status === 'none'
              ? options.noAnswer === 'never'
                ? NEVER
                : NO_ANSWER
              : 0;

      if (id === lastDriver) {
        score += runLength < options.stintsInARow ? CONTINUE_RUN : RUN_TOO_LONG;
      } else {
        const owed = options.minRestStints - restSince(id);
        if (owed > 0) score += owed * MISSING_REST;
      }

      const ahead = ((driven.get(id) ?? 0) - least) / length;
      score += ahead * AHEAD_BY_A_STINT * (options.balance === 'faster' ? 0.4 : 1);
      if (options.balance === 'faster' && quickest !== null) {
        const lap = lapOf(id);
        if (lap !== null) score += ((lap - quickest) / 1000) * SECOND_SLOWER;
      }

      if (best === null || score < best.score) best = { id, score };
    }
    if (!best) break;
    const next: StintInput = { driverId: best.id };
    plan.push(next);
    added.push(next);
  }
  return added;
}
