/**
 * How the stint plan and timeline are shown: which table columns, and which timezone. A personal
 * view preference, saved in this browser (not on the server).
 */
import { detectTimeZone, type Me, type RaceEvent, type UserSummary } from '@le-uma/shared';
import { useEffect, useState } from 'react';

export const STINT_COLUMNS = {
  spotter: 'Spotter',
  laps: 'Laps',
  lap: 'Lap time',
  fuel: 'Fuel',
  driverTime: 'Driver time',
  pit: 'Pit stop',
} as const;
export type StintColumn = keyof typeof STINT_COLUMNS;

export interface StintDisplay {
  columns: Record<StintColumn, boolean>;
  /** An IANA zone name, or "" for the viewer's own zone. */
  zone: string;
}

const DEFAULTS: StintDisplay = {
  columns: { spotter: true, laps: true, lap: true, fuel: false, driverTime: false, pit: true },
  zone: '',
};
const KEY = 'le-uma:stint-display';

function load(): StintDisplay {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<StintDisplay> | null;
    const columns = { ...DEFAULTS.columns };
    for (const c of Object.keys(columns) as StintColumn[]) {
      const v = saved?.columns?.[c];
      if (typeof v === 'boolean') columns[c] = v;
    }
    return { columns, zone: typeof saved?.zone === 'string' ? saved.zone : DEFAULTS.zone };
  } catch {
    return DEFAULTS;
  }
}

export function useStintDisplay() {
  const [display, setDisplay] = useState<StintDisplay>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(display));
    } catch {
      // Private mode or storage full: the choice just won't persist.
    }
  }, [display]);
  return [display, setDisplay] as const;
}

export interface ZoneOption {
  zone: string;
  /** e.g. "Europe/Berlin · track time, Lukas" */
  label: string;
}

/**
 * The timezones worth offering: track time, the browser's zone, your profile zone, then each
 * person's. People (and roles) in the same zone share one entry.
 */
export function zoneChoices(
  me: Pick<Me, 'id' | 'timezone'>,
  event: Pick<RaceEvent, 'trackTimezone'>,
  people: Pick<UserSummary, 'id' | 'timezone' | 'displayName' | 'username'>[],
  browserZone: string = detectTimeZone(),
): ZoneOption[] {
  const who = new Map<string, string[]>();
  const add = (zone: string | null, label: string) => {
    if (zone) who.set(zone, [...(who.get(zone) ?? []), label]);
  };
  add(event.trackTimezone, 'track time');
  add(browserZone, 'browser default');
  add(me.timezone, 'you');
  for (const p of people) if (p.id !== me.id) add(p.timezone, p.displayName ?? p.username);
  return [...who].map(([zone, labels]) => ({ zone, label: `${zone} · ${labels.join(', ')}` }));
}

/** The saved zone if it's still on offer; otherwise the viewer's own. */
export function resolveZone(saved: string, options: ZoneOption[], fallback: string): string {
  return options.some((o) => o.zone === saved) ? saved : fallback;
}
