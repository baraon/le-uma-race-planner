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
  checks: 'Checks & notes',
} as const;
export type StintColumn = keyof typeof STINT_COLUMNS;

/** "browser" | "me" | "track" | "utc" | "user:<id>" */
export type ZoneChoice = string;

export interface StintDisplay {
  columns: Record<StintColumn, boolean>;
  zone: ZoneChoice;
}

const DEFAULTS: StintDisplay = {
  columns: {
    spotter: true,
    laps: true,
    lap: true,
    fuel: false,
    driverTime: false,
    pit: true,
    checks: true,
  },
  zone: 'me',
};
const KEY = 'le-uma:stint-display';

function load(): StintDisplay {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<StintDisplay> | null;
    return {
      columns: { ...DEFAULTS.columns, ...(saved?.columns ?? {}) },
      zone: typeof saved?.zone === 'string' ? saved.zone : DEFAULTS.zone,
    };
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
  choice: ZoneChoice;
  label: string;
  zone: string;
}

/** Browser, you, track, UTC, then every teammate with a zone. */
export function zoneChoices(me: Me, event: RaceEvent, drivers: UserSummary[]): ZoneOption[] {
  const browser = detectTimeZone();
  const options: ZoneOption[] = [
    { choice: 'browser', label: `Browser default (${browser})`, zone: browser },
    ...(me.timezone
      ? [{ choice: 'me', label: `Your timezone (${me.timezone})`, zone: me.timezone }]
      : []),
    ...(event.trackTimezone
      ? [
          {
            choice: 'track',
            label: `Track time (${event.trackTimezone})`,
            zone: event.trackTimezone,
          },
        ]
      : []),
    { choice: 'utc', label: 'UTC', zone: 'UTC' },
  ];
  for (const d of drivers) {
    if (d.id === me.id || !d.timezone) continue;
    options.push({
      choice: `user:${d.id}`,
      label: `${d.displayName ?? d.username} (${d.timezone})`,
      zone: d.timezone,
    });
  }
  return options;
}

/** The zone for a saved choice, falling back to the viewer's own when it no longer applies. */
export function resolveZone(choice: ZoneChoice, options: ZoneOption[], fallback: string): string {
  return options.find((o) => o.choice === choice)?.zone ?? fallback;
}
