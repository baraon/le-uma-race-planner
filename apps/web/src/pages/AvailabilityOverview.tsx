/**
 * The team's availability for one race: a row per driver, a coverage row (how many drivers are
 * available in each slot, against how many the race needs), and a written list of the gaps.
 * Times can be shown in any zone; the slots themselves are the same instants for everyone.
 */
import {
  coverage,
  coverageGaps,
  eventEnd,
  formatSlotLabel,
  slotCount,
  slotStart,
  type EventWindow,
  type Paint,
  type RaceEvent,
  type UserSummary,
} from '@le-uma/shared';
import { Fragment, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { slotClass, statusLabel } from '../components/status';
import {
  describeMarks,
  describePaint,
  describeSlots,
  StatusLegend,
  TimeAxis,
} from '../components/Timeline';
import { Card, Muted } from '../components/ui';
import { Avatar } from '../UserMenu';
import { useNow } from '../lib/now';
import { zoneChoices } from '../lib/stintDisplay';
import { rowsFor } from '../lib/paint';

const nameOf = (u: UserSummary) => u.displayName ?? u.username;

type Hover = { slot: number; userId: string | null } | null;

export function AvailabilityOverview({
  event,
  window: w,
  drivers,
  paintOf,
  viewerZone,
  meId,
}: {
  event: RaceEvent;
  window: EventWindow;
  drivers: UserSummary[];
  paintOf: (userId: string) => Paint;
  viewerZone: string;
  meId: string;
}) {
  const [zone, setZone] = useState(viewerZone);
  const [hover, setHover] = useState<Hover>(null);
  const now = useNow();
  const count = slotCount(w);
  const needed = event.minDrivers ?? 1;
  const paints = new Map(drivers.map((d) => [d.id, paintOf(d.id)]));
  const counts = coverage([...paints.values()], count);
  const gaps = coverageGaps(counts, needed);
  const rows = rowsFor(count);
  const perRow = rows[0]!.end;
  const options = zoneChoices({ id: meId, timezone: viewerZone }, event, drivers);

  const nowSlot =
    now >= w.startsAt && now < eventEnd(w)
      ? (now.getTime() - w.startsAt.getTime()) / (15 * 60_000)
      : null;

  /** Keyboard: arrows move through slots (Up/Down by a row of the wrapped layout). */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = hover?.slot ?? 0;
    const to =
      e.key === 'ArrowRight'
        ? at + 1
        : e.key === 'ArrowLeft'
          ? at - 1
          : e.key === 'ArrowDown'
            ? at + perRow
            : e.key === 'ArrowUp'
              ? at - perRow
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? count - 1
                  : null;
    if (to === null) return;
    e.preventDefault();
    setHover({ slot: Math.max(0, Math.min(count - 1, to)), userId: null });
  };

  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    if (!cell) return;
    setHover({ slot: Number(cell.dataset.slot), userId: cell.dataset.user ?? null });
  };

  return (
    <Card
      title={`${event.teamName} availability`}
      action={
        <label className="flex items-center gap-2 text-sm text-text-muted">
          Times in
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="max-w-64 rounded-md border border-border bg-surface-raised px-2 py-1 text-text"
          >
            {options.map((o) => (
              <option key={o.zone} value={o.zone}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {drivers.length === 0 ? (
        <Muted>Nobody is on this team yet.</Muted>
      ) : (
        <div className="flex flex-col gap-4">
          <HoverDetails
            w={w}
            hover={hover}
            zone={zone}
            viewerZone={viewerZone}
            drivers={drivers}
            paints={paints}
            counts={counts}
            needed={needed}
          />

          <div
            className="overflow-x-auto rounded-md"
            tabIndex={0}
            role="group"
            aria-label={`${event.teamName} availability grid. Use the arrow keys to move between 15-minute slots; details are announced above the grid.`}
            onKeyDown={onKeyDown}
            onFocus={() => setHover((h) => h ?? { slot: 0, userId: null })}
            onBlur={() => setHover(null)}
            onPointerOver={onPointerOver}
            onPointerLeave={() => setHover(null)}
          >
            <div className="flex min-w-[640px] flex-col gap-5">
              {rows.map((row) => (
                <div
                  key={row.start}
                  className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5"
                  aria-label={describeMarks(w, zone, row.start, row.end) || undefined}
                >
                  <span className="self-end text-xs whitespace-nowrap text-text-muted">
                    {rows.length > 1 && formatSlotLabel(slotStart(w, row.start), zone)}
                  </span>
                  <div
                    className="relative"
                    style={{ width: `${((row.end - row.start) / perRow) * 100}%` }}
                  >
                    <TimeAxis window={w} zone={zone} from={row.start} to={row.end} />
                  </div>

                  <span className="flex items-center text-xs font-medium text-text-muted">
                    Available{needed > 1 && ` (need ${needed})`}
                  </span>
                  <RowCells row={row} perRow={perRow} nowSlot={nowSlot}>
                    {counts.slice(row.start, row.end).map((n, k) => {
                      const i = row.start + k;
                      const short = n < needed;
                      return (
                        <div
                          key={i}
                          data-slot={i}
                          className={`flex h-6 min-w-0 flex-1 items-center justify-center rounded-[2px] text-[10px] tabular-nums ${
                            n === 0
                              ? 'bg-unavailable/30'
                              : short
                                ? 'bg-maybe/30'
                                : 'bg-available/30'
                          } ${short ? 'border-b-2 border-unavailable font-bold' : ''} ${
                            hover?.slot === i ? 'outline-2 outline-text' : ''
                          }`}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </RowCells>

                  {drivers.map((d) => {
                    const paint = paints.get(d.id)!;
                    return (
                      <Fragment key={d.id}>
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar me={d} size={20} />
                          <span className="truncate text-sm">
                            {nameOf(d)}
                            {d.id === meId && <span className="text-text-muted"> (you)</span>}
                          </span>
                        </span>
                        <RowCells
                          row={row}
                          perRow={perRow}
                          nowSlot={nowSlot}
                          label={`${nameOf(d)}: ${describePaint(
                            w,
                            paint.map((s, i) => (i >= row.start && i < row.end ? s : null)),
                            zone,
                          )}`}
                        >
                          {paint.slice(row.start, row.end).map((s, k) => {
                            const i = row.start + k;
                            return (
                              <div
                                key={i}
                                data-slot={i}
                                data-user={d.id}
                                className={`h-6 min-w-0 flex-1 rounded-[2px] ${slotClass(s)} ${
                                  hover?.slot === i ? 'outline-2 outline-text' : ''
                                }`}
                              />
                            );
                          })}
                        </RowCells>
                      </Fragment>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <GapSummary w={w} gaps={gaps} needed={needed} zone={zone} />
          <StatusLegend />
        </div>
      )}
    </Card>
  );
}

/** One row's cells, sized to its share of a full row, with the "now" line when it falls here. */
function RowCells({
  row,
  perRow,
  nowSlot,
  label,
  children,
}: {
  row: { start: number; end: number };
  perRow: number;
  nowSlot: number | null;
  label?: string;
  children: ReactNode;
}) {
  const showNow = nowSlot !== null && nowSlot >= row.start && nowSlot < row.end;
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      className="relative flex gap-px"
      style={{ width: `${((row.end - row.start) / perRow) * 100}%` }}
    >
      {children}
      {showNow && (
        <div
          className="pointer-events-none absolute -inset-y-1 w-0.5 bg-accent-strong"
          style={{ left: `${((nowSlot - row.start) / (row.end - row.start)) * 100}%` }}
          title="Now"
        />
      )}
    </div>
  );
}

function HoverDetails({
  w,
  hover,
  zone,
  viewerZone,
  drivers,
  paints,
  counts,
  needed,
}: {
  w: EventWindow;
  hover: Hover;
  zone: string;
  viewerZone: string;
  drivers: UserSummary[];
  paints: Map<string, Paint>;
  counts: number[];
  needed: number;
}) {
  if (!hover) {
    return (
      <p className="min-h-12 text-sm text-text-muted">
        Hover over or tap a slot (or focus the grid and use the arrow keys) to see each
        driver&apos;s status and local time.
      </p>
    );
  }
  const { slot } = hover;
  const n = counts[slot] ?? 0;
  return (
    <div className="min-h-12 text-sm" aria-live="polite">
      <p>
        <span className="font-medium">{describeSlots(w, slot, slot + 1, zone)}</span>
        {zone !== viewerZone && (
          <span className="text-text-muted">
            {' '}
            · {describeSlots(w, slot, slot + 1, viewerZone)} for you
          </span>
        )}
        <span className={n < needed ? 'text-unavailable' : 'text-available'}>
          {' '}
          · {n} available{n < needed && ` (${needed} needed)`}
        </span>
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        {drivers.map((d) => {
          const s = paints.get(d.id)?.[slot] ?? null;
          return (
            <li key={d.id} className={hover.userId === d.id ? 'text-text' : undefined}>
              <span
                className={`mr-1 inline-block size-2.5 rounded-sm align-middle ${slotClass(s)}`}
                aria-hidden
              />
              {nameOf(d)}: {s ? statusLabel[s] : 'No answer'}
              {d.timezone && ` · ${formatSlotLabel(slotStart(w, slot), d.timezone)} their time`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GapSummary({
  w,
  gaps,
  needed,
  zone,
}: {
  w: EventWindow;
  gaps: ReturnType<typeof coverageGaps>;
  needed: number;
  zone: string;
}) {
  if (gaps.length === 0) {
    return (
      <p className="text-sm text-available">
        ✓ Covered: {needed === 1 ? 'someone is' : `${needed} drivers are`} available for the whole
        race.
      </p>
    );
  }
  return (
    <div className="text-sm">
      <p className="font-medium text-unavailable">
        <span aria-hidden>⚠ </span>
        {gaps.length === 1 ? 'One stretch is' : `${gaps.length} stretches are`} short of drivers
        {needed > 1 && ` (${needed} needed)`}:
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 text-text-muted">
        {gaps.map((g) => (
          <li key={g.startSlot}>
            {describeSlots(w, g.startSlot, g.endSlot, zone)} —{' '}
            {g.fewest === 0 ? 'nobody available' : `as few as ${g.fewest}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
