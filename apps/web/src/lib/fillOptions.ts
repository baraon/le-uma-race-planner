/** "Fill to the flag" preferences, saved in this browser. */
import { FILL_DEFAULTS, type FillOptions } from '@le-uma/shared';
import { useEffect, useState } from 'react';

const KEY = 'le-uma:fill-options';
const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.max(min, Math.min(max, Math.round(v)))
    : fallback;

function load(): FillOptions {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FillOptions> | null;
    return {
      stintsInARow: clamp(s?.stintsInARow, 1, 6, FILL_DEFAULTS.stintsInARow),
      minRestStints: clamp(s?.minRestStints, 0, 12, FILL_DEFAULTS.minRestStints),
      maybe: s?.maybe === 'never' ? 'never' : 'avoid',
      noAnswer: s?.noAnswer === 'never' ? 'never' : 'avoid',
      balance: s?.balance === 'faster' ? 'faster' : 'equal',
    };
  } catch {
    return FILL_DEFAULTS;
  }
}

export function useFillOptions() {
  const [options, setOptions] = useState<FillOptions>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(options));
    } catch {
      // Private mode or storage full: the choice just won't persist.
    }
  }, [options]);
  return [options, setOptions] as const;
}
