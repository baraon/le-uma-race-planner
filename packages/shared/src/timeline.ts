/**
 * What to draw on a race timeline's axis for a viewer in `zone`: hour ticks, a marker where the
 * local date changes, and a marker where the zone's clocks change (daylight saving).
 * Positions are slot indexes, so they line up with the slots whatever the zone.
 */
import { slotCount, slotStart, type EventWindow } from './slots';
import {
  formatSlotLabel,
  localDayChanged,
  zoneAbbreviation,
  zoneOffsetMinutes,
  zonedParts,
} from './timezones';

export interface AxisTick {
  slot: number;
  label: string;
}

export interface DayMark {
  slot: number;
  /** "Sun 25 Oct" */
  label: string;
}

export interface ClockChange {
  slot: number;
  /** Minutes the clocks moved: -60 when they go back, +60 when they go forward. */
  deltaMinutes: number;
  /** Zone abbreviations either side, e.g. "CEST" → "CET". */
  from: string;
  to: string;
}

export interface AxisMarks {
  ticks: AxisTick[];
  days: DayMark[];
  clockChanges: ClockChange[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Marks for slots [from, to) of the race (the whole race by default). */
export function axisMarks(w: EventWindow, zone: string, from = 0, to = slotCount(w)): AxisMarks {
  const days: DayMark[] = [];
  const clockChanges: ClockChange[] = [];
  for (let i = Math.max(1, from); i < to; i++) {
    const prev = slotStart(w, i - 1);
    const at = slotStart(w, i);
    if (localDayChanged(prev, at, zone)) {
      const p = zonedParts(at, zone);
      days.push({ slot: i, label: `${p.weekday} ${p.day} ${MONTHS[p.month - 1]}` });
    }
    const delta = zoneOffsetMinutes(at, zone) - zoneOffsetMinutes(prev, zone);
    if (delta !== 0) {
      clockChanges.push({
        slot: i,
        deltaMinutes: delta,
        from: zoneAbbreviation(prev, zone),
        to: zoneAbbreviation(at, zone),
      });
    }
  }

  // Every hour for short spans; every 2, 3, ... hours for long ones (about a dozen labels).
  const step = 4 * Math.max(1, Math.ceil((to - from) / 4 / 12));
  const daySlots = new Set(days.map((d) => d.slot));
  const ticks: AxisTick[] = [];
  for (let i = from; i < to; i += step) {
    if (daySlots.has(i)) continue; // the day marker labels this spot
    ticks.push({ slot: i, label: formatSlotLabel(slotStart(w, i), zone, i === from) });
  }
  return { ticks, days, clockChanges };
}
