/**
 * The stint plan: an ordered list of stints whose laps, times and pit stops are computed from the
 * event's strategy settings and the drivers' pace (all editable variables, CLAUDE.md rule 6).
 * Times are exact instants shown in the viewer's zone; availability conflicts come from laying
 * each stint over the 15-minute availability grid.
 */
import {
  availabilityDuring,
  availabilityWindow,
  averagePace,
  blocksToPaint,
  driverTotals,
  formatLapTime,
  formatSlotLabel,
  formatStintLength,
  localDayChanged,
  parseLapTime,
  planStints,
  qualifyingSlots,
  suggestStints,
  slotCount,
  zoneAbbreviation,
  type EventWindow,
  type GroupDetail,
  type Me,
  type Pace,
  type PlannedStint,
  type RaceEvent,
  type AvailabilityRow,
  type PaceRow,
  type Stint,
  type UserSummary,
} from '@le-uma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DisplayBar } from '../components/DisplayBar';
import { FillMenu } from '../components/FillMenu';
import { StintStatusIcon } from '../components/StintStatus';
import { button, Card, ErrorText, input, Muted } from '../components/ui';
import { saveStints } from '../lib/api';
import { useFillOptions } from '../lib/fillOptions';
import { keys, useAvailability, usePace, useStints } from '../lib/queries';
import { useNavigationGuard } from '../lib/router';
import { resolveZone, useStintDisplay, zoneChoices } from '../lib/stintDisplay';
import { viewerTimeZone } from '../lib/session';
import { StintTimeline } from './StintTimeline';

const nameOf = (u: UserSummary) => u.displayName ?? u.username;
const blank = (driverId: string | null): Stint => ({
  driverId,
  spotterId: null,
  lapsOverride: null,
  lapMsOverride: null,
  extraPitSeconds: 0,
  notes: null,
});

export function StintPlanCard({
  event,
  group,
  me,
}: {
  event: RaceEvent;
  group: GroupDetail;
  me: Me;
}) {
  const saved = useStints(event.id);
  const pace = usePace(event.id);
  const availability = useAvailability(event.id);
  if (saved.isPending || pace.isPending || availability.isPending) {
    return (
      <Card title="Stint plan">
        <Muted>Loading…</Muted>
      </Card>
    );
  }
  if (saved.error || pace.error || availability.error) {
    return (
      <Card title="Stint plan">
        <ErrorText error={saved.error ?? pace.error ?? availability.error} />
      </Card>
    );
  }
  return (
    <StintPlanEditor
      key={JSON.stringify(saved.data)}
      event={event}
      group={group}
      me={me}
      saved={saved.data}
      paceRows={pace.data}
      availabilityRows={availability.data}
    />
  );
}

function StintPlanEditor({
  event,
  group,
  me,
  saved,
  paceRows,
  availabilityRows,
}: {
  event: RaceEvent;
  group: GroupDetail;
  me: Me;
  saved: Stint[];
  paceRows: PaceRow[];
  availabilityRows: AvailabilityRow[];
}) {
  const [draft, setDraftState] = useState<Stint[]>(saved);
  const [version, setVersion] = useState(0);
  /** Structural changes (reorder, remove, undo, fill) also reset the rows' own input state. */
  const setDraft = (next: Stint[] | ((d: Stint[]) => Stint[])) => {
    setDraftState(next);
    setVersion((v) => v + 1);
  };
  const qc = useQueryClient();
  const [display, setDisplay] = useStintDisplay();
  const [fillOptions, setFillOptions] = useFillOptions();
  const col = display.columns;
  const canEdit = group.permissions.manageEvents;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useNavigationGuard(dirty, 'You have unsaved changes to the stint plan. Leave without saving?');

  const w: EventWindow = {
    startsAt: new Date(event.startsAt),
    durationMinutes: event.durationMinutes,
  };
  const team = group.teams.find((t) => t.id === event.teamId);
  const drivers = (team?.memberIds ?? [])
    .map((id) => group.members.find((m) => m.user.id === id)?.user)
    .filter((u): u is UserSummary => u !== undefined);
  const people = new Map(group.members.map((m) => [m.user.id, m.user]));
  const zoneOptions = zoneChoices(me, event, drivers);
  const zone = resolveZone(display.zone, zoneOptions, viewerTimeZone(me));
  const fuelUnit = event.fuelUnit === 'percent' ? '%' : 'L';
  const paceById = new Map<string, Pace>(paceRows.map((p) => [p.userId, p]));
  const average = averagePace([...paceById.values()]);
  // Availability rows start at qualifying when the event includes it; the plan covers the race
  // only, so drop the qualifying slots to line the paint up with the race window.
  const count = slotCount(w);
  const lead = qualifyingSlots(event);
  const marked = slotCount(availabilityWindow({ ...event, startsAt: w.startsAt }));
  const paintById = new Map(
    availabilityRows.map((r) => [r.userId, blocksToPaint(r.blocks, marked).slice(lead)]),
  );
  const paintOf = (id: string) => paintById.get(id) ?? blocksToPaint([], count);

  const plan = planStints(w, event, draft, (id) => paceById.get(id) ?? null, average);
  const totals = driverTotals(plan);
  const totalDriving = totals.reduce((n, t) => n + t.drivingMs, 0);

  const save = useMutation({
    mutationFn: () => saveStints(event.id, draft),
    onSuccess: (rows) => qc.setQueryData(keys.stints(event.id), rows),
  });

  const update = (i: number, patch: Partial<Stint>) => {
    setDraftState((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    save.reset();
  };
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  /** Screen-reader announcement after a reorder. */
  const [moved, setMoved] = useState('');
  const body = useRef<HTMLTableSectionElement>(null);
  /** After a keyboard move, the handle to focus once the rows re-render. */
  const focusHandle = useRef<number | null>(null);
  const moveTo = (from: number, to: number) => {
    if (to === from || to < 0 || to >= draft.length) return;
    setDraft((d) => {
      const next = [...d];
      const [s] = next.splice(from, 1);
      next.splice(to, 0, s!);
      return next;
    });
    setMoved(`Stint ${from + 1} moved to position ${to + 1} of ${draft.length}`);
    save.reset();
  };
  useEffect(() => {
    if (focusHandle.current === null) return;
    body.current?.querySelector<HTMLElement>(`[data-handle="${focusHandle.current}"]`)?.focus();
    focusHandle.current = null;
  }, [version]);
  /** The row under a pointer position (the last row when below the table). */
  const rowAt = (clientY: number) => {
    const rows = [...(body.current?.querySelectorAll('tr') ?? [])];
    const at = rows.findIndex((r) => clientY < r.getBoundingClientRect().bottom);
    return at === -1 ? Math.max(0, rows.length - 1) : at;
  };
  /** The next driver in team order after the last stint's driver. */
  const nextDriver = (list: Stint[]) => {
    if (drivers.length === 0) return null;
    const last = list.at(-1)?.driverId;
    const at = drivers.findIndex((d) => d.id === last);
    return drivers[(at + 1) % drivers.length]!.id;
  };
  const addStint = () => {
    setDraft((d) => [...d, blank(nextDriver(d))]);
    save.reset();
  };
  /** Appends suggested stints (available, rested, fair) until the plan reaches the flag. */
  const fillToFlag = () => {
    const added = suggestStints(
      w,
      event,
      draft,
      drivers.map((d) => d.id),
      (id) => paceById.get(id) ?? null,
      average,
      paintOf,
      fillOptions,
    );
    if (added.length === 0) return;
    setDraft((d) => [...d, ...added.map((a) => blank(a.driverId))]);
    save.reset();
  };

  const checks = plan.stints
    .filter((p) => !p.afterFlag && p.driverId)
    .map((p) => availabilityDuring(w, paintOf(p.driverId!), p.start, p.end));
  const notAvailable = checks.filter((c) => c === 'unavailable').length;
  const unsure = checks.filter((c) => c === 'maybe' || c === 'none').length;

  // The longest back-to-back run, to warn when it's beyond the preferred run length.
  let longest: { driverId: string; stints: number; ms: number } | null = null;
  {
    const run = plan.stints.filter((p) => !p.afterFlag);
    for (let i = 0; i < run.length;) {
      let j = i;
      while (j + 1 < run.length && run[j + 1]!.driverId === run[i]!.driverId) j++;
      const id = run[i]!.driverId;
      if (id && (!longest || j - i + 1 > longest.stints)) {
        longest = {
          driverId: id,
          stints: j - i + 1,
          ms: run[j]!.end.getTime() - run[i]!.start.getTime(),
        };
      }
      i = j + 1;
    }
  }
  const longRun = longest && longest.stints > fillOptions.stintsInARow ? longest : null;

  const timeLabel = (at: Date, prev?: Date) =>
    formatSlotLabel(at, zone, !prev || localDayChanged(prev, at, zone));

  let summary: ReactNode;
  if (draft.length === 0) {
    summary = <Muted>No stints yet.{canEdit && ' Add stints or fill the race in one go.'}</Muted>;
  } else if (plan.missingPace) {
    summary = (
      <p className="text-sm text-maybe">
        <span aria-hidden>⚠ </span>Stint {plan.stints.length + 1} can&apos;t be timed: nobody has
        entered pace yet. Add pace above, or set laps and lap time on that stint.
      </p>
    );
  } else if (plan.uncoveredFrom) {
    const left =
      new Date(w.startsAt.getTime() + event.durationMinutes * 60_000).getTime() -
      plan.uncoveredFrom.getTime();
    summary = (
      <p className="text-sm text-maybe">
        <span aria-hidden>⚠ </span>The plan ends {timeLabel(plan.uncoveredFrom)}{' '}
        {zoneAbbreviation(plan.uncoveredFrom, zone)}, {formatStintLength(left)} before the flag.
        {canEdit && ' Add stints or fill to the flag.'}
      </p>
    );
  } else {
    summary = (
      <p className="text-sm text-available">
        ✓ Covers the whole race · about {plan.projectedLaps} laps by the flag
        {(notAvailable > 0 || unsure > 0) && (
          <span className="text-text-muted">
            {' '}
            ·{' '}
            {notAvailable > 0 && (
              <span className="text-unavailable">✕ {notAvailable} not available</span>
            )}
            {notAvailable > 0 && unsure > 0 && ', '}
            {unsure > 0 && <span className="text-maybe">⚠ {unsure} maybe or no answer</span>}
          </span>
        )}
        {longRun && (
          <span className="block text-maybe">
            <span aria-hidden>⚠ </span>
            {people.get(longRun.driverId) ? nameOf(people.get(longRun.driverId)!) : 'A driver'}{' '}
            drives {longRun.stints} stints in a row ({formatStintLength(longRun.ms)}). Check who
            else could cover part of it.
          </span>
        )}
      </p>
    );
  }

  return (
    <>
      <StintTimeline
        w={w}
        plan={plan}
        stints={draft}
        drivers={drivers}
        people={people}
        paintOf={paintOf}
        zone={zone}
      />
      <Card
        title="Stint plan"
        action={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <>
                <button type="button" className={button.secondary} onClick={addStint}>
                  Add stint
                </button>
                <button type="button" className={button.secondary} onClick={fillToFlag}>
                  Fill to the flag
                </button>
                <FillMenu options={fillOptions} onChange={setFillOptions} />
              </>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <DisplayBar
            display={display}
            onChange={setDisplay}
            zones={zoneOptions}
            zone={zone}
            abbreviation={(z) => zoneAbbreviation(w.startsAt, z)}
          />
          {summary}

          {draft.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-text-muted">
                  <tr>
                    <th className="py-2 pr-2 font-normal">
                      <span className="sr-only">
                        {canEdit ? 'Reorder and driver status' : 'Driver status'}
                      </span>
                    </th>
                    <th className="py-2 pr-2 font-normal">#</th>
                    <th className="py-2 pr-2 font-normal">Driver</th>
                    {col.spotter && <th className="py-2 pr-2 font-normal">Spotter</th>}
                    {col.laps && <th className="py-2 pr-2 font-normal">Laps</th>}
                    {col.lap && <th className="py-2 pr-2 font-normal">Lap</th>}
                    {col.fuel && <th className="py-2 pr-2 font-normal">Fuel</th>}
                    <th className="py-2 pr-2 font-normal">
                      Time ({zoneAbbreviation(w.startsAt, zone)})
                    </th>
                    {col.driverTime && <th className="py-2 pr-2 font-normal">Driver time</th>}
                    {col.pit && <th className="py-2 pr-2 font-normal">Stop after</th>}
                    {canEdit && (
                      <th className="py-2 font-normal">
                        <span className="sr-only">Remove</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody ref={body}>
                  {draft.map((s, i) => {
                    const p: PlannedStint | undefined = plan.stints[i];
                    const driver = s.driverId ? people.get(s.driverId) : undefined;
                    const timed = p !== undefined && !p.afterFlag;
                    const driverCheck =
                      timed && s.driverId
                        ? availabilityDuring(w, paintOf(s.driverId), p.start, p.end)
                        : null;
                    const spotterCheck =
                      timed && s.spotterId
                        ? availabilityDuring(w, paintOf(s.spotterId), p.start, p.end)
                        : null;
                    const dropTarget = drag !== null && drag.over === i && drag.from !== i;
                    return (
                      <tr
                        key={`${version}-${i}`}
                        id={`stint-${i + 1}`}
                        className={`scroll-mt-80 border-t border-border align-middle ${
                          p?.afterFlag || drag?.from === i ? 'opacity-50' : ''
                        } ${
                          dropTarget
                            ? drag.over < drag.from
                              ? 'border-t-2 border-t-accent-strong'
                              : 'border-b-2 border-b-accent-strong'
                            : ''
                        }`}
                      >
                        <td className="py-2 pr-2 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            {canEdit && (
                              <button
                                type="button"
                                data-handle={i}
                                className="inline-flex size-6 cursor-grab touch-none items-center justify-center rounded text-lg leading-none text-text-muted hover:text-text active:cursor-grabbing"
                                aria-label={`Reorder stint ${i + 1}: drag it, or press the up and down arrow keys`}
                                title="Drag to reorder"
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.preventDefault();
                                  e.currentTarget.setPointerCapture(e.pointerId);
                                  setDrag({ from: i, over: i });
                                }}
                                onPointerMove={(e) => {
                                  if (!drag) return;
                                  // Keep the list moving when dragging near the screen edges.
                                  if (e.clientY < 80) window.scrollBy(0, -14);
                                  else if (e.clientY > window.innerHeight - 80)
                                    window.scrollBy(0, 14);
                                  const over = rowAt(e.clientY);
                                  if (over !== drag.over) setDrag({ ...drag, over });
                                }}
                                onPointerUp={() => {
                                  if (!drag) return;
                                  moveTo(drag.from, drag.over);
                                  setDrag(null);
                                }}
                                onPointerCancel={() => setDrag(null)}
                                onKeyDown={(e) => {
                                  const to =
                                    e.key === 'ArrowUp'
                                      ? i - 1
                                      : e.key === 'ArrowDown'
                                        ? i + 1
                                        : null;
                                  if (to === null || to < 0 || to >= draft.length) return;
                                  e.preventDefault();
                                  focusHandle.current = to;
                                  moveTo(i, to);
                                }}
                              >
                                <span aria-hidden>⠿</span>
                              </button>
                            )}
                            {driverCheck ? (
                              <StintStatusIcon
                                check={driverCheck}
                                who={driver ? nameOf(driver) : 'Driver'}
                              />
                            ) : (
                              <span
                                className="inline-flex size-6 items-center justify-center text-text-muted"
                                title={p?.afterFlag ? 'After the flag' : 'No driver assigned'}
                              >
                                <span aria-hidden>–</span>
                                <span className="sr-only">
                                  {p?.afterFlag ? 'After the flag' : 'No driver assigned'}
                                </span>
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 pr-2 tabular-nums text-text-muted">{i + 1}</td>
                        <td className="py-2 pr-2">
                          {canEdit ? (
                            <select
                              value={s.driverId ?? ''}
                              onChange={(e) => update(i, { driverId: e.target.value || null })}
                              aria-label={`Driver for stint ${i + 1}`}
                              className={`${input} w-36 py-1`}
                            >
                              <option value="">Unassigned</option>
                              {drivers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {nameOf(d)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-medium">
                              {driver ? nameOf(driver) : 'Unassigned'}
                            </span>
                          )}
                        </td>
                        {col.spotter && (
                          <td className="py-2 pr-2 whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              {canEdit ? (
                                <select
                                  value={s.spotterId ?? ''}
                                  onChange={(e) => update(i, { spotterId: e.target.value || null })}
                                  aria-label={`Spotter for stint ${i + 1}`}
                                  className={`${input} w-32 py-1`}
                                >
                                  <option value="">None</option>
                                  {group.members.map((m) => (
                                    <option key={m.user.id} value={m.user.id}>
                                      {nameOf(m.user)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-text-muted">
                                  {s.spotterId && people.get(s.spotterId)
                                    ? nameOf(people.get(s.spotterId)!)
                                    : '—'}
                                </span>
                              )}
                              {spotterCheck && spotterCheck !== 'ok' && (
                                <StintStatusIcon
                                  check={spotterCheck}
                                  who={
                                    s.spotterId && people.get(s.spotterId)
                                      ? `Spotter ${nameOf(people.get(s.spotterId)!)}`
                                      : 'Spotter'
                                  }
                                />
                              )}
                            </span>
                          </td>
                        )}
                        {col.laps && (
                          <td className="py-2 pr-2">
                            {canEdit ? (
                              <input
                                type="number"
                                min={1}
                                max={1000}
                                value={s.lapsOverride ?? ''}
                                placeholder={p ? String(p.laps) : ''}
                                onChange={(e) =>
                                  update(i, {
                                    lapsOverride: e.target.value
                                      ? Math.max(1, Math.round(Number(e.target.value)))
                                      : null,
                                  })
                                }
                                aria-label={`Laps for stint ${i + 1} (leave empty to use the calculated value)`}
                                className={`${input} w-16 py-1`}
                              />
                            ) : (
                              <span className="tabular-nums">{p?.laps ?? '—'}</span>
                            )}
                          </td>
                        )}
                        {col.lap && (
                          <td className="py-2 pr-2">
                            {canEdit ? (
                              <LapOverride
                                value={s.lapMsOverride}
                                placeholder={
                                  p ? `${p.estimated ? '~' : ''}${formatLapTime(p.lapMs)}` : ''
                                }
                                label={`Lap time for stint ${i + 1} (leave empty to use the driver's pace${p?.estimated ? '; currently the team average' : ''})`}
                                onChange={(ms) => update(i, { lapMsOverride: ms })}
                              />
                            ) : (
                              <span
                                className={`tabular-nums ${p?.estimated ? 'text-text-muted italic' : ''}`}
                                title={p?.estimated ? 'Estimated: team average pace' : undefined}
                              >
                                {p ? `${p.estimated ? '~' : ''}${formatLapTime(p.lapMs)}` : '—'}
                              </span>
                            )}
                          </td>
                        )}
                        {col.fuel && (
                          <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
                            {p ? `${Number(p.fuelNeeded.toFixed(1))} ${fuelUnit}` : '—'}
                          </td>
                        )}
                        <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
                          {!p ? (
                            '—'
                          ) : p.afterFlag ? (
                            <span className="text-text-muted">after the flag</span>
                          ) : (
                            <>
                              {timeLabel(p.start)} → {timeLabel(p.end, p.start)}
                              {p.endsAtFlag && (
                                <>
                                  {' '}
                                  <span aria-hidden title="Ends at the flag">
                                    🏁
                                  </span>
                                  <span className="sr-only">ends at the flag</span>
                                </>
                              )}
                              <span className="block text-[11px] text-text-muted">
                                {formatStintLength(p.end.getTime() - p.start.getTime())}
                              </span>
                            </>
                          )}
                        </td>
                        {col.driverTime && (
                          <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
                            {timed && driver?.timezone ? (
                              <>
                                {formatSlotLabel(p.start, driver.timezone)} →{' '}
                                {formatSlotLabel(
                                  p.end,
                                  driver.timezone,
                                  localDayChanged(p.start, p.end, driver.timezone),
                                )}
                                <span className="block text-[11px] text-text-muted">
                                  {driver.timezone}
                                </span>
                              </>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}
                        {col.pit && (
                          <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
                            {p && p.pitMs > 0 ? `${(p.pitMs / 1000).toFixed(1)} s` : '—'}
                            {canEdit && timed && !p.endsAtFlag && i < draft.length - 1 && (
                              <label className="mt-1 flex items-center gap-1 text-[11px] text-text-muted">
                                +
                                <input
                                  type="number"
                                  min={0}
                                  max={3600}
                                  step="any"
                                  value={s.extraPitSeconds || ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    update(i, {
                                      extraPitSeconds: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  aria-label={`Extra seconds in the stop after stint ${i + 1}`}
                                  className={`${input} w-14 px-1.5 py-0.5 text-[11px]`}
                                />
                                s extra
                              </label>
                            )}
                          </td>
                        )}
                        {canEdit && (
                          <td className="py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="inline-flex size-6 items-center justify-center rounded text-text-muted hover:text-unavailable"
                              onClick={() => {
                                setDraft((d) => d.filter((_, j) => j !== i));
                                save.reset();
                              }}
                              aria-label={`Remove stint ${i + 1}`}
                              title="Remove stint"
                            >
                              <span aria-hidden>🗑</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="sr-only" aria-live="polite">
                {moved}
              </p>
            </div>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={button.primary}
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? 'Saving…' : 'Save plan'}
              </button>
              {dirty && (
                <button type="button" className={button.link} onClick={() => setDraft(saved)}>
                  Undo changes
                </button>
              )}
              {draft.length > 0 && (
                <button
                  type="button"
                  className={button.link}
                  onClick={() => {
                    setDraft([]);
                    save.reset();
                  }}
                >
                  Clear plan
                </button>
              )}
              <span aria-live="polite" className="text-sm">
                {dirty ? (
                  <span className="text-maybe">● Unsaved changes</span>
                ) : save.isSuccess ? (
                  <span className="text-available">✓ Saved</span>
                ) : null}
              </span>
              <ErrorText error={save.error} />
            </div>
          )}

          {totals.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Driving time</h3>
              <table className="w-full max-w-xl text-left text-sm">
                <thead className="text-xs text-text-muted">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Driver</th>
                    <th className="py-1 pr-3 font-normal">Stints</th>
                    <th className="py-1 pr-3 font-normal">Laps</th>
                    <th className="py-1 pr-3 font-normal">Driving</th>
                    <th className="py-1 font-normal">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((t) => {
                    const share = totalDriving > 0 ? t.drivingMs / totalDriving : 0;
                    const u = people.get(t.driverId);
                    return (
                      <tr key={t.driverId} className="border-t border-border">
                        <td className="py-1.5 pr-3">{u ? nameOf(u) : 'Former member'}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{t.stints}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{t.laps}</td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {formatStintLength(t.drivingMs)}
                        </td>
                        <td className="py-1.5">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-24 rounded-full bg-surface-raised" aria-hidden>
                              <span
                                className="block h-2 rounded-full bg-accent"
                                style={{ width: `${share * 100}%` }}
                              />
                            </span>
                            <span className="tabular-nums text-xs text-text-muted">
                              {Math.round(share * 100)}%
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

/** Lap-time override typed as m:ss.s; empty means "use the driver's pace". */
function LapOverride({
  value,
  placeholder,
  label,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  label: string;
  onChange: (ms: number | null) => void;
}) {
  const [text, setText] = useState(value ? formatLapTime(value) : '');
  const parsed = text.trim() ? parseLapTime(text) : null;
  const invalid = text.trim() !== '' && (parsed === null || parsed < 10_000);
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const ms = e.target.value.trim() ? parseLapTime(e.target.value) : null;
        if (!e.target.value.trim()) onChange(null);
        else if (ms !== null && ms >= 10_000) onChange(ms);
      }}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={`${input} w-20 py-1 ${invalid ? 'border-unavailable' : ''}`}
    />
  );
}
