/** Shared pieces of the race timeline: slot descriptions, the time axis and the legend. */
import {
  axisMarks,
  formatSlotLabel,
  localDayChanged,
  paintToBlocks,
  slotCount,
  slotStart,
  zoneAbbreviation,
  type EventWindow,
  type Paint,
} from '@le-uma/shared';
import { slotClass, statusLabel } from './status';

/** "Sat 18:00–18:15 CST" for slots [from, to) in `zone`. */
export function describeSlots(w: EventWindow, from: number, to: number, zone: string): string {
  const start = slotStart(w, from);
  const end = slotStart(w, to);
  return `${formatSlotLabel(start, zone)}–${formatSlotLabel(end, zone, localDayChanged(start, end, zone))} ${zoneAbbreviation(start, zone)}`;
}

/** Plain-language summary of a row, for screen readers. */
export function describePaint(w: EventWindow, paint: Paint, zone: string): string {
  const blocks = paintToBlocks(paint);
  if (blocks.length === 0) return 'No answer yet';
  return blocks
    .map((b) => `${statusLabel[b.status]} ${describeSlots(w, b.startSlot, b.endSlot, zone)}`)
    .join('; ');
}

/**
 * The axis for slots [from, to) of the race (the whole race by default) in `zone`: hour ticks,
 * the date at local midnight, and a badge where the clocks change.
 */
export function TimeAxis({
  window: w,
  zone,
  from = 0,
  to,
}: {
  window: EventWindow;
  zone: string;
  from?: number;
  to?: number;
}) {
  const end = to ?? slotCount(w);
  const length = end - from;
  const { ticks, days, clockChanges } = axisMarks(w, zone, from, end);
  const left = (slot: number) => `${((slot - from) / length) * 100}%`;

  return (
    <div className="relative h-5 text-[11px] text-text-muted" aria-hidden>
      {ticks.map((t) => (
        <span
          key={`t${t.slot}`}
          className="absolute whitespace-nowrap border-l border-border pl-1"
          style={{ left: left(t.slot) }}
        >
          {t.label}
        </span>
      ))}
      {days.map((d) => (
        <span
          key={`d${d.slot}`}
          className="absolute whitespace-nowrap border-l-2 border-text pl-1 font-semibold text-text"
          style={{ left: left(d.slot) }}
        >
          {d.label}
        </span>
      ))}
      {clockChanges.map((c) => (
        <span
          key={`c${c.slot}`}
          title={`Clocks go ${c.deltaMinutes < 0 ? 'back' : 'forward'} ${Math.abs(c.deltaMinutes)} min here (${c.from} → ${c.to})`}
          className="absolute -top-0.5 z-10 whitespace-nowrap rounded border border-maybe bg-surface px-1 text-maybe"
          style={{ left: left(c.slot) }}
        >
          {c.deltaMinutes < 0 ? '↺' : '↻'} {c.deltaMinutes < 0 ? '−' : '+'}
          {Math.abs(c.deltaMinutes) % 60 === 0
            ? `${Math.abs(c.deltaMinutes) / 60} h`
            : `${Math.abs(c.deltaMinutes)} min`}
        </span>
      ))}
    </div>
  );
}

/** Screen-reader text for the day and clock-change marks of a span, if any. */
export function describeMarks(w: EventWindow, zone: string, from = 0, to = slotCount(w)): string {
  const { days, clockChanges } = axisMarks(w, zone, from, to);
  return [
    ...days.map(
      (d) => `Midnight, ${d.label}, at ${describeSlots(w, d.slot, d.slot + 1, zone).split('–')[0]}`,
    ),
    ...clockChanges.map(
      (c) =>
        `Clocks go ${c.deltaMinutes < 0 ? 'back' : 'forward'} ${Math.abs(c.deltaMinutes)} minutes (${c.from} to ${c.to})`,
    ),
  ].join('. ');
}

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-text-muted">
      {(Object.keys(statusLabel) as (keyof typeof statusLabel)[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={`size-3.5 rounded-sm ${slotClass(s)}`} aria-hidden />
          {statusLabel[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="size-3.5 rounded-sm slot-empty" aria-hidden />
        No answer
      </li>
    </ul>
  );
}
