/**
 * Paint availability on the race timeline. Slots are counted from the green flag, so every
 * driver paints the same instants whatever their timezone; only the labels are local.
 *
 * Mouse and touch: press and drag across the strip. Keyboard: arrows move, Space paints, Shift
 * + arrows paints while moving, 1/2/3 pick a status and 0 the eraser. Long races paint in bigger
 * brush steps and wrap onto several rows; storage is always 15-minute slots.
 */
import {
  blocksToPaint,
  formatSlotLabel,
  paintToBlocks,
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
} from '@lmu/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { slotClass, statusClass, statusLabel } from '../components/status';
import { describeSlots, TimeAxis } from '../components/Timeline';
import { button, Card, ErrorText, Muted } from '../components/ui';
import * as api from '../lib/api';
import {
  BRUSH_STEPS,
  chunkOf,
  defaultStep,
  paintChunks,
  rowsFor,
  type BrushStep,
} from '../lib/paint';
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
  const w: EventWindow = {
    startsAt: new Date(event.startsAt),
    durationMinutes: event.durationMinutes,
  };
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
        title="Your availability"
        action={
          editable.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-text-muted">
              Editing
              <select
                value={targetId ?? ''}
                onChange={(e) => {
                  if (confirmDiscard()) setTargetId(e.target.value);
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
  const savedPaint = blocksToPaint(saved?.blocks ?? [], count);
  const rows = rowsFor(count);
  const perRow = rows[0]!.end;
  const [draft, setDraft] = useState<Paint>(savedPaint);
  const [brush, setBrush] = useState<Brush>('available');
  const [step, setStep] = useState<BrushStep>(defaultStep(count));
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

  /** Paints the brush-sized chunks from slot a through slot b. */
  const paintRange = (a: number, b: number, with_: Brush = brush, size: number = step) => {
    setDraft((d) => paintChunks(d, a, b, size, with_));
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

  const [chunkFrom, chunkTo] = chunkOf(cursor, step, count);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = (to: number) => {
      const next = chunkOf(Math.max(0, Math.min(count - 1, to)), step, count)[0];
      if (e.shiftKey) paintRange(cursor, next);
      setCursor(next);
    };
    const picked = brushes.find((b) => b.key === e.key);
    if (picked) setBrush(picked.brush);
    else if (e.key === 'ArrowRight') move(chunkTo);
    else if (e.key === 'ArrowLeft') move(chunkFrom - 1);
    else if (e.key === 'ArrowDown' && rows.length > 1) move(cursor + perRow);
    else if (e.key === 'ArrowUp' && rows.length > 1) move(cursor - perRow);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(count - 1);
    else if (e.key === ' ' || e.key === 'Enter') paintRange(cursor, cursor);
    else if (e.key === 'Delete' || e.key === 'Backspace') paintRange(cursor, cursor, null);
    else return;
    e.preventDefault();
  };

  const [shownFrom, shownTo] = chunkOf(hover ?? cursor, step, count);
  const shownStatus = draft[shownFrom] ?? null;
  const theirZone =
    !isSelf && target.timezone && target.timezone !== viewerZone ? target.timezone : null;
  const sizeLabel = (n: BrushStep) => (n === 4 ? '1 h' : `${n * 15} min`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Paint with</legend>
          {brushes.map((b) => (
            <label
              key={b.key}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                brush === b.brush ? 'border-text bg-surface-raised' : 'border-border'
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
              <kbd className="text-[10px] text-text-muted">{b.key}</kbd>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex items-center gap-1 text-sm">
          <legend className="sr-only">Brush size</legend>
          <span className="mr-1 text-text-muted" aria-hidden>
            Brush
          </span>
          {BRUSH_STEPS.map((n) => (
            <label
              key={n}
              className={`cursor-pointer rounded-md border px-2.5 py-1.5 ${
                step === n ? 'border-text bg-surface-raised' : 'border-border text-text-muted'
              }`}
            >
              <input
                type="radio"
                name="brush-size"
                className="sr-only"
                checked={step === n}
                onChange={() => {
                  setStep(n);
                  setCursor((c) => chunkOf(c, n, count)[0]);
                }}
              />
              {sizeLabel(n)}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="overflow-x-auto">
        <div
          ref={editor}
          role="slider"
          tabIndex={0}
          aria-label={`Availability for ${isSelf ? 'you' : nameOf(target)}, in ${sizeLabel(step)} steps. Arrow keys move, Space paints, Shift and arrows paint while moving.`}
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={cursor + 1}
          aria-valuetext={`${describeSlots(w, chunkFrom, chunkTo, viewerZone)}: ${draft[cursor] ? statusLabel[draft[cursor]!] : 'no answer'}`}
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
                <TimeAxis window={w} zone={viewerZone} from={row.start} to={row.end} />
                <div
                  data-row-start={row.start}
                  data-row-end={row.end}
                  className={`flex cursor-crosshair gap-px ${rows.length > 1 ? 'h-10' : 'h-12'}`}
                >
                  {draft.slice(row.start, row.end).map((s, k) => {
                    const i = row.start + k;
                    const inCursor = focused && i >= chunkFrom && i < chunkTo;
                    return (
                      <div
                        key={i}
                        className={`min-w-0 flex-1 rounded-[2px] ${slotClass(s)} ${
                          step > 1 && i % step === 0 && i !== row.start ? 'ml-[3px]' : ''
                        } ${inCursor ? 'outline-2 outline-offset-1 outline-text' : ''} ${
                          s !== savedPaint[i] ? 'opacity-80' : ''
                        }`}
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
        <span className="text-text-muted">{describeSlots(w, shownFrom, shownTo, viewerZone)}</span>
        {theirZone && (
          <span className="text-text-muted">
            {' '}
            · {describeSlots(w, shownFrom, shownTo, theirZone)} for {nameOf(target)}
          </span>
        )}{' '}
        · {shownStatus ? statusLabel[shownStatus] : 'No answer'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button.secondary}
          onClick={() => paintRange(0, count - 1, 'available', 1)}
        >
          Available for whole race
        </button>
        <button
          type="button"
          className={button.secondary}
          onClick={() => paintRange(0, count - 1, null, 1)}
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
