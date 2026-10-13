/**
 * Paint availability on the race timeline. Slots are counted from the green flag (or from the
 * start of qualifying when the event includes it), so every driver paints the same instants
 * whatever their timezone; only the labels are local.
 *
 * Mouse and touch: press and drag across the strip. Keyboard: arrows move, Space paints, Shift
 * + arrows paints while moving, 1/2/3 pick a status and 0 the eraser. Long races wrap onto
 * several 6-hour rows.
 */
import {
  availabilityWindow,
  blocksToPaint,
  formatSlotLabel,
  paintToBlocks,
  qualifyingSlots,
  slotCount,
  slotStart,
  type AvailabilityRow,
  type AvailabilityStatus,
  type EventWindow,
  type GroupDetail,
  type Me,
  type Paint,
  type RaceEvent,
  type UserSummary,
} from '@le-uma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { slotClass, statusClass, statusLabel } from '../components/status';
import { describeSlots, SessionBand, TimeAxis } from '../components/Timeline';
import { button, Card, ErrorText, Muted } from '../components/ui';
import * as api from '../lib/api';
import { paintRange as paintSlots, rowsFor } from '../lib/paint';
import { keys, useAvailability, useGroupMutation } from '../lib/queries';
import { confirmDiscard, useNavigationGuard } from '../lib/router';
import { viewerTimeZone } from '../lib/session';
import { AvailabilityOverview } from './AvailabilityOverview';

type Brush = AvailabilityStatus | null;

const brushes: { brush: Brush; key: string; label: string }[] = [
  { brush: 'available', key: '1', label: statusLabel.available },
  { brush: 'maybe', key: '2', label: statusLabel.maybe },
  { brush: 'unavailable', key: '3', label: statusLabel.unavailable },
  { brush: null, key: '0', label: 'Eraser' },
];

const nameOf = (u: UserSummary) => u.displayName ?? u.username;

export function AvailabilitySection({
  event,
  group,
  me,
}: {
  event: RaceEvent;
  group: GroupDetail;
  me: Me;
}) {
  const availability = useAvailability(event.id);
  const w = availabilityWindow({ ...event, startsAt: new Date(event.startsAt) });
  const count = slotCount(w);
  const zone = viewerTimeZone(me);

  const team = group.teams.find((t) => t.id === event.teamId);
  const drivers = (team?.memberIds ?? [])
    .map((id) => group.members.find((m) => m.user.id === id)?.user)
    .filter((u): u is UserSummary => u !== undefined);
  const onTeam = drivers.some((d) => d.id === me.id);
  const editable = group.permissions.manageAvailability
    ? drivers
    : drivers.filter((d) => d.id === me.id);
  const [targetId, setTargetId] = useState(onTeam ? me.id : (editable[0]?.id ?? null));
  const target = editable.find((d) => d.id === targetId) ?? null;
  const join = useGroupMutation(group.id, () => api.joinTeam(event.teamId));

  const rows = new Map((availability.data ?? []).map((r) => [r.userId, r]));
  const paintOf = (userId: string): Paint => blocksToPaint(rows.get(userId)?.blocks ?? [], count);

  return (
    <>
      <Card
        title={
          target && target.id !== me.id ? `${nameOf(target)}’s availability` : 'Your availability'
        }
        action={
          editable.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-text-muted">
              Editing
              <select
                value={targetId ?? ''}
                onChange={(e) => {
                  const next = e.target.value;
                  void confirmDiscard().then((ok) => ok && setTargetId(next));
                }}
                className="rounded-md border border-border bg-surface-raised px-2 py-1 text-text"
              >
                {editable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id === me.id ? `${nameOf(d)} (you)` : nameOf(d)}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      >
        {availability.isPending ? (
          <Muted>Loading…</Muted>
        ) : availability.error ? (
          <ErrorText error={availability.error} />
        ) : target ? (
          <PaintEditor
            key={target.id}
            event={event}
            window={w}
            target={target}
            isSelf={target.id === me.id}
            viewerZone={zone}
            saved={rows.get(target.id)}
          />
        ) : (
          <div className="flex flex-col items-start gap-3">
            <Muted>Only drivers on {event.teamName} mark availability for this race.</Muted>
            <button
              type="button"
              className={button.primary}
              disabled={join.isPending}
              onClick={() => join.mutate(undefined, { onSuccess: () => setTargetId(me.id) })}
            >
              Join {event.teamName}
            </button>
            <ErrorText error={join.error} />
          </div>
        )}
      </Card>

      <AvailabilityOverview
        event={event}
        window={w}
        drivers={drivers}
        paintOf={paintOf}
        viewerZone={zone}
        meId={me.id}
      />
    </>
  );
}

function PaintEditor({
  event,
  window: w,
  target,
  isSelf,
  viewerZone,
  saved,
}: {
  event: RaceEvent;
  window: EventWindow;
  target: UserSummary;
  isSelf: boolean;
  viewerZone: string;
  saved: AvailabilityRow | undefined;
}) {
  const count = slotCount(w);
  const qualifying = qualifyingSlots(event);
  const savedPaint = blocksToPaint(saved?.blocks ?? [], count);
  const rows = rowsFor(count);
  const perRow = rows[0]!.end;
  const [draft, setDraft] = useState<Paint>(savedPaint);
  const [brush, setBrush] = useState<Brush>('available');
  const [cursor, setCursor] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number } | null>(null);
  const qc = useQueryClient();

  const dirty = draft.some((s, i) => s !== savedPaint[i]);
  useNavigationGuard(dirty, 'You have unsaved availability. Leave without saving?');

  const save = useMutation({
    mutationFn: () => api.saveAvailability(event.id, target.id, paintToBlocks(draft)),
    onSuccess: (row) => {
      qc.setQueryData<AvailabilityRow[]>(keys.availability(event.id), (rows = []) => [
        ...rows.filter((r) => r.userId !== row.userId),
        ...(row.blocks.length > 0 ? [row] : []),
      ]);
    },
  });

  /** Paints slots a through b (either order). */
  const paintRange = (a: number, b: number, with_: Brush = brush) => {
    setDraft((d) => paintSlots(d, a, b, with_));
    save.reset();
  };

  /** The slot under the pointer, found through whichever row it's over. */
  const indexAt = (clientX: number, clientY: number): number | null => {
    const row = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-row-start]');
    if (!row || !editor.current?.contains(row)) return null;
    const start = Number(row.dataset.rowStart);
    const end = Number(row.dataset.rowEnd);
    const rect = row.getBoundingClientRect();
    const i = start + Math.floor(((clientX - rect.left) / rect.width) * (end - start));
    return Math.max(start, Math.min(end - 1, i));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const i = indexAt(e.clientX, e.clientY);
    if (i === null) return;
    e.preventDefault();
    editor.current!.focus();
    editor.current!.setPointerCapture(e.pointerId);
    drag.current = { last: i };
    setCursor(i);
    paintRange(i, i);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const i = indexAt(e.clientX, e.clientY);
    setHover(i);
    if (!drag.current || i === null) return;
    // Fill from the last position so fast drags don't skip slots.
    paintRange(drag.current.last, i);
    drag.current.last = i;
    setCursor(i);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = (to: number) => {
      const next = Math.max(0, Math.min(count - 1, to));
      if (e.shiftKey) paintRange(cursor, next);
      setCursor(next);
    };
    const picked = brushes.find((b) => b.key === e.key);
    if (picked) setBrush(picked.brush);
    else if (e.key === 'ArrowRight') move(cursor + 1);
    else if (e.key === 'ArrowLeft') move(cursor - 1);
    else if (e.key === 'ArrowDown' && rows.length > 1) move(cursor + perRow);
    else if (e.key === 'ArrowUp' && rows.length > 1) move(cursor - perRow);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(count - 1);
    else if (e.key === ' ' || e.key === 'Enter') paintRange(cursor, cursor);
    else if (e.key === 'Delete' || e.key === 'Backspace') paintRange(cursor, cursor, null);
    else return;
    e.preventDefault();
  };

  const shown = hover ?? cursor;
  const shownStatus = draft[shown] ?? null;
  const theirZone =
    !isSelf && target.timezone && target.timezone !== viewerZone ? target.timezone : null;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Paint with</legend>
        {brushes.map((b) => (
          <label
            key={b.key}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-strong ${
              brush === b.brush ? 'border-accent-strong bg-surface-raised' : 'border-border'
            }`}
          >
            <input
              type="radio"
              name="brush"
              className="sr-only"
              checked={brush === b.brush}
              onChange={() => setBrush(b.brush)}
            />
            <span
              className={`size-4 rounded-sm ${b.brush ? statusClass[b.brush] : 'slot-empty border border-text-muted'}`}
              aria-hidden
            />
            {b.label}
          </label>
        ))}
      </fieldset>

      <div className="overflow-x-auto">
        <div
          ref={editor}
          role="slider"
          tabIndex={0}
          aria-label={`Availability for ${isSelf ? 'you' : nameOf(target)}. Arrow keys move, Space paints, Shift and arrows paint while moving; 1, 2, 3 pick Available, Maybe, Not available and 0 the eraser.`}
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={cursor + 1}
          aria-valuetext={`${cursor < qualifying ? 'Qualifying, ' : ''}${describeSlots(w, cursor, cursor + 1, viewerZone)}: ${draft[cursor] ? statusLabel[draft[cursor]!] : 'no answer'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`grid min-w-[640px] touch-none select-none items-end gap-x-3 gap-y-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-4 focus-visible:ring-offset-surface ${
            rows.length > 1 ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'
          }`}
        >
          {rows.map((row) => (
            <Fragment key={row.start}>
              {rows.length > 1 && (
                <span className="pb-2.5 text-xs whitespace-nowrap text-text-muted" aria-hidden>
                  {formatSlotLabel(slotStart(w, row.start), viewerZone)}
                </span>
              )}
              <div style={{ width: `${((row.end - row.start) / perRow) * 100}%` }}>
                <SessionBand qualifying={qualifying} from={row.start} to={row.end} />
                <TimeAxis window={w} zone={viewerZone} from={row.start} to={row.end} />
                <div
                  data-row-start={row.start}
                  data-row-end={row.end}
                  className={`flex cursor-crosshair gap-px ${rows.length > 1 ? 'h-10' : 'h-12'}`}
                >
                  {draft.slice(row.start, row.end).map((s, k) => {
                    const i = row.start + k;
                    const inCursor = focused && i === cursor;
                    return (
                      <div
                        key={i}
                        className={`min-w-0 flex-1 rounded-[2px] ${slotClass(s)} ${
                          inCursor ? 'outline-2 outline-offset-1 outline-text' : ''
                        } ${s !== savedPaint[i] ? 'opacity-80' : ''}`}
                      />
                    );
                  })}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <p className="min-h-5 text-sm" aria-hidden>
        <span className="text-text-muted">
          {shown < qualifying && 'Qualifying · '}
          {describeSlots(w, shown, shown + 1, viewerZone)}
        </span>
        {theirZone && (
          <span className="text-text-muted">
            {' '}
            · {describeSlots(w, shown, shown + 1, theirZone)} for {nameOf(target)}
          </span>
        )}{' '}
        · {shownStatus ? statusLabel[shownStatus] : 'No answer'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button.secondary}
          onClick={() => paintRange(0, count - 1, 'available')}
        >
          {qualifying > 0 ? 'Available for qualifying and race' : 'Available for whole race'}
        </button>
        <button
          type="button"
          className={button.secondary}
          onClick={() => paintRange(0, count - 1, null)}
        >
          Clear
        </button>
        {dirty && (
          <button type="button" className={button.link} onClick={() => setDraft(savedPaint)}>
            Undo changes
          </button>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span aria-live="polite" className="text-sm">
            {dirty ? (
              <span className="text-maybe">● Unsaved changes</span>
            ) : save.isSuccess ? (
              <span className="text-available">✓ Saved</span>
            ) : null}
          </span>
          <button
            type="button"
            className={button.primary}
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>
      <ErrorText error={save.error} />
    </div>
  );
}
