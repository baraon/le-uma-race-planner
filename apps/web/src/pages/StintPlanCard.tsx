/**
 * The stint plan: an ordered list of stints whose laps, times and pit stops are computed from the
 * event's strategy settings and the drivers' pace (all editable variables, CLAUDE.md rule 6).
 * Times are exact instants shown in the viewer's zone; availability conflicts come from laying
 * each stint over the 15-minute availability grid.
 */
import {
  availabilityDuring,
  averagePace,
  blocksToPaint,
  driverTotals,
  formatLapTime,
  formatSlotLabel,
  formatStintLength,
  localDayChanged,
  parseLapTime,
  planStints,
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
  type StintAvailability,
  type UserSummary,
} from '@le-uma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { button, Card, ErrorText, input, Muted } from '../components/ui';
import { saveStints } from '../lib/api';
import { keys, useAvailability, usePace, useStints } from '../lib/queries';
import { useNavigationGuard } from '../lib/router';
import { viewerTimeZone } from '../lib/session';

const nameOf = (u: UserSummary) => u.displayName ?? u.username;
const blank = (driverId: string | null): Stint => ({
  driverId,
  spotterId: null,
  lapsOverride: null,
  lapMsOverride: null,
  extraPitSeconds: 0,
  notes: null,
});

const conflictText: Record<Exclude<StintAvailability, 'ok'>, string> = {
  unavailable: 'Not available',
  maybe: 'Maybe',
  none: 'No answer',
};
const conflictClass: Record<Exclude<StintAvailability, 'ok'>, string> = {
  unavailable: 'border-unavailable/70 text-unavailable',
  maybe: 'border-maybe/70 text-maybe',
  none: 'border-border text-text-muted',
};

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

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
  const zone = viewerTimeZone(me);
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
  const paceById = new Map<string, Pace>(paceRows.map((p) => [p.userId, p]));
  const average = averagePace([...paceById.values()]);
  const count = slotCount(w);
  const paintById = new Map(
    availabilityRows.map((r) => [r.userId, blocksToPaint(r.blocks, count)]),
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
  const move = (i: number, by: -1 | 1) => {
    setDraft((d) => {
      const next = [...d];
      const [s] = next.splice(i, 1);
      next.splice(i + by, 0, s!);
      return next;
    });
    save.reset();
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
  /** Appends stints, rotating through the team, until the plan reaches the flag. */
  const fillToFlag = () => {
    setDraft((d) => {
      const next = [...d];
      for (let guard = 0; guard < 300; guard++) {
        const p = planStints(w, event, next, (id) => paceById.get(id) ?? null, average);
        if (p.missingPace || p.uncoveredFrom === null) break;
        next.push(blank(nextDriver(next)));
      }
      return next;
    });
    save.reset();
  };

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
      </p>
    );
  }

  return (
    <Card
      title="Stint plan"
      action={
        canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button.secondary} onClick={addStint}>
              Add stint
            </button>
            <button type="button" className={button.secondary} onClick={fillToFlag}>
              Fill to the flag
            </button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {summary}

        {draft.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs text-text-muted">
                <tr>
                  <th className="py-2 pr-2 font-normal">#</th>
                  <th className="py-2 pr-2 font-normal">Driver</th>
                  <th className="py-2 pr-2 font-normal">Spotter</th>
                  <th className="py-2 pr-2 font-normal">Laps</th>
                  <th className="py-2 pr-2 font-normal">Lap</th>
                  <th className="py-2 pr-2 font-normal">
                    Time ({zoneAbbreviation(w.startsAt, zone)})
                  </th>
                  <th className="py-2 pr-2 font-normal">Stop after</th>
                  <th className="py-2 pr-2 font-normal">Checks</th>
                  {canEdit && (
                    <th className="py-2 font-normal">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {draft.map((s, i) => {
                  const p: PlannedStint | undefined = plan.stints[i];
                  const driver = s.driverId ? people.get(s.driverId) : undefined;
                  const driverCheck =
                    p && s.driverId && !p.afterFlag
                      ? availabilityDuring(w, paintOf(s.driverId), p.start, p.end)
                      : 'ok';
                  const spotterCheck =
                    p && s.spotterId && !p.afterFlag
                      ? availabilityDuring(w, paintOf(s.spotterId), p.start, p.end)
                      : 'ok';
                  return (
                    <tr
                      key={`${version}-${i}`}
                      className={`border-t border-border align-middle ${p?.afterFlag ? 'opacity-50' : ''}`}
                    >
                      <td className="py-2 pr-2 tabular-nums text-text-muted">{i + 1}</td>
                      <td className="py-2 pr-2">
                        {canEdit ? (
                          <select
                            value={s.driverId ?? ''}
                            onChange={(e) => update(i, { driverId: e.target.value || null })}
                            aria-label={`Driver for stint ${i + 1}`}
                            className={`${input} w-32 py-1`}
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
                      <td className="py-2 pr-2">
                        {canEdit ? (
                          <select
                            value={s.spotterId ?? ''}
                            onChange={(e) => update(i, { spotterId: e.target.value || null })}
                            aria-label={`Spotter for stint ${i + 1}`}
                            className={`${input} w-28 py-1`}
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
                      </td>
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
                            className={`${input} w-14 py-1`}
                          />
                        ) : (
                          <span className="tabular-nums">{p?.laps ?? '—'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {canEdit ? (
                          <LapOverride
                            value={s.lapMsOverride}
                            placeholder={p ? formatLapTime(p.lapMs) : ''}
                            label={`Lap time for stint ${i + 1} (leave empty to use the driver's pace)`}
                            onChange={(ms) => update(i, { lapMsOverride: ms })}
                          />
                        ) : (
                          <span className="tabular-nums">{p ? formatLapTime(p.lapMs) : '—'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
                        {p ? (
                          <span
                            title={
                              driver?.timezone
                                ? `${nameOf(driver)}: ${formatSlotLabel(p.start, driver.timezone)}–${formatSlotLabel(p.end, driver.timezone, localDayChanged(p.start, p.end, driver.timezone))} ${zoneAbbreviation(p.start, driver.timezone)}`
                                : undefined
                            }
                          >
                            {timeLabel(p.start)} → {timeLabel(p.end, p.start)}
                            <span className="block text-[11px] text-text-muted">
                              {formatStintLength(p.end.getTime() - p.start.getTime())}
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
                        {p && p.pitMs > 0 ? `${(p.pitMs / 1000).toFixed(1)} s` : '—'}
                        {canEdit && p && !p.afterFlag && !p.endsAtFlag && i < draft.length - 1 && (
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
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-1">
                          {p?.afterFlag && (
                            <Badge className="border-border text-text-muted">after the flag</Badge>
                          )}
                          {p?.endsAtFlag && (
                            <Badge className="border-accent-strong/60 text-accent-strong">
                              🏁 flag
                            </Badge>
                          )}
                          {p?.estimated && (
                            <Badge className="border-maybe/60 text-maybe">estimated pace</Badge>
                          )}
                          {driverCheck !== 'ok' && (
                            <Badge className={conflictClass[driverCheck]}>
                              <span aria-hidden>⚠ </span>driver: {conflictText[driverCheck]}
                            </Badge>
                          )}
                          {spotterCheck !== 'ok' && (
                            <Badge className={conflictClass[spotterCheck]}>
                              <span aria-hidden>⚠ </span>spotter: {conflictText[spotterCheck]}
                            </Badge>
                          )}
                          {s.notes && !canEdit && (
                            <span className="text-xs text-text-muted">{s.notes}</span>
                          )}
                        </div>
                        {canEdit && (
                          <input
                            value={s.notes ?? ''}
                            maxLength={500}
                            placeholder="Notes"
                            onChange={(e) => update(i, { notes: e.target.value || null })}
                            aria-label={`Notes for stint ${i + 1}`}
                            className={`${input} mt-1 w-full min-w-28 px-2 py-0.5 text-xs`}
                          />
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className={`${button.link} inline-flex size-6 items-center justify-center`}
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                            aria-label={`Move stint ${i + 1} up`}
                          >
                            ↑
                          </button>{' '}
                          <button
                            type="button"
                            className={`${button.link} inline-flex size-6 items-center justify-center`}
                            disabled={i === draft.length - 1}
                            onClick={() => move(i, 1)}
                            aria-label={`Move stint ${i + 1} down`}
                          >
                            ↓
                          </button>{' '}
                          <button
                            type="button"
                            className={`${button.link} inline-flex size-6 items-center justify-center`}
                            onClick={() => {
                              setDraft((d) => d.filter((_, j) => j !== i));
                              save.reset();
                            }}
                            aria-label={`Remove stint ${i + 1}`}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                      <td className="py-1.5 pr-3 tabular-nums">{formatStintLength(t.drivingMs)}</td>
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
