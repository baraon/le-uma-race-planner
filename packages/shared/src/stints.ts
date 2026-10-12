/**
 * Stint maths. Pure functions over user-supplied variables (CLAUDE.md rule 6): nothing here
 * assumes a track, car or driver. Times are milliseconds; instants are absolute.
 */

export interface Pace {
  /** Average race lap, in milliseconds. */
  lapMs: number;
  /** Fuel or energy used per lap, in the event's unit. */
  consumptionPerLap: number;
}

/** Whole laps a full tank allows (at least one, so a plan never stalls). */
export function lapsPerStint(capacity: number, consumptionPerLap: number): number {
  if (!(capacity > 0) || !(consumptionPerLap > 0)) return 1;
  // A tiny epsilon keeps exact fits (100 / 10 = 10 laps) from rounding down on float error.
  return Math.max(1, Math.floor(capacity / consumptionPerLap + 1e-9));
}

export function stintDurationMs(laps: number, lapMs: number): number {
  return laps * lapMs;
}

/** Average of the drivers who entered numbers; null if nobody has. */
export function averagePace(paces: readonly Pace[]): Pace | null {
  if (paces.length === 0) return null;
  return {
    lapMs: Math.round(paces.reduce((s, p) => s + p.lapMs, 0) / paces.length),
    consumptionPerLap: paces.reduce((s, p) => s + p.consumptionPerLap, 0) / paces.length,
  };
}

const LAP_TIME = /^(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)$/;

/** "3:59.123", "4:02", "59.5" → milliseconds; null if it doesn't look like a lap time. */
export function parseLapTime(text: string): number | null {
  const m = LAP_TIME.exec(text.trim());
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = Number(m[2]);
  if (m[1] && seconds >= 60) return null;
  const ms = Math.round((minutes * 60 + seconds) * 1000);
  return ms > 0 ? ms : null;
}

/** 239123 → "3:59.123" (trailing zeros of the fraction trimmed: 240000 → "4:00.0"). */
export function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  let s = seconds.toFixed(3).replace(/0{1,2}$/, '');
  if (seconds < 10) s = `0${s}`;
  return `${minutes}:${s}`;
}

/** 2_662_000 → "44 min 22 s"; 7_200_000 → "2 h 0 min". */
export function formatStintLength(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min ${s} s`;
}
