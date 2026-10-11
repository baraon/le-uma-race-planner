/** Shared pieces of the race timeline: the time axis and a read-only row of slots. */
import {
  formatSlotLabel,
  localDayChanged,
  paintToBlocks,
  slotCount,
  slotStart,
  zoneAbbreviation,
  type EventWindow,
  type Paint,
} from '@lmu/shared';
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
 * Hour ticks in `zone` for slots [from, to) of the race (the whole race by default), labelled
 * with the weekday when the local date changes.
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
  // Every hour for short spans; every 2, 3, ... hours for long ones (about a dozen labels).
  const step = 4 * Math.max(1, Math.ceil(length / 4 / 12));
  const ticks: { i: number; label: string }[] = [];
  for (let i = from; i < end; i += step) {
    const at = slotStart(w, i);
    const newDay = i === 0 || localDayChanged(slotStart(w, Math.max(0, i - step)), at, zone);
    ticks.push({ i, label: formatSlotLabel(at, zone, newDay) });
  }

  return (
    <div className="relative h-5 text-[11px] text-text-muted" aria-hidden>
      {ticks.map((t) => (
        <span
          key={t.i}
          className="absolute whitespace-nowrap border-l border-border pl-1"
          style={{ left: `${((t.i - from) / length) * 100}%` }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

export function SlotStrip({
  window: w,
  paint,
  zone,
  name,
}: {
  window: EventWindow;
  paint: Paint;
  zone: string;
  name: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${name}: ${describePaint(w, paint, zone)}`}
      className="flex h-6 gap-px"
    >
      {paint.map((s, i) => (
        <div
          key={i}
          title={`${describeSlots(w, i, i + 1, zone)} · ${s ? statusLabel[s] : 'No answer'}`}
          className={`min-w-0 flex-1 rounded-[2px] ${slotClass(s)}`}
        />
      ))}
    </div>
  );
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
