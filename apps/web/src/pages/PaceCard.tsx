/**
 * Each team driver's race pace for this event's track and class, and what it means for stints:
 * whole laps on a full tank and the stint length. Values are the drivers' own (CLAUDE.md rule 6);
 * missing ones fall back to the team average and are marked "estimated".
 */
import {
  averagePace,
  formatLapTime,
  formatStintLength,
  lapsPerStint,
  parseLapTime,
  stintDurationMs,
  type GroupDetail,
  type Me,
  type Pace,
  type PaceRow,
  type RaceEvent,
  type UserSummary,
} from '@le-uma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppLink, button, Card, ErrorText, input, Muted } from '../components/ui';
import { deletePace, savePace } from '../lib/api';
import { keys, usePace } from '../lib/queries';
import { Avatar } from '../UserMenu';

const nameOf = (u: UserSummary) => u.displayName ?? u.username;

export function unitLabel(event: RaceEvent): string {
  return event.fuelUnit === 'percent' ? '% energy' : 'litres';
}

export function PaceCard({ event, group, me }: { event: RaceEvent; group: GroupDetail; me: Me }) {
  const pace = usePace(event.id);
  const team = group.teams.find((t) => t.id === event.teamId);
  const drivers = (team?.memberIds ?? [])
    .map((id) => group.members.find((m) => m.user.id === id)?.user)
    .filter((u): u is UserSummary => u !== undefined);
  const canManage = group.permissions.manageEvents;

  if (!event.track || !event.carClass) {
    return (
      <Card title="Driver pace">
        <Muted>
          Pace is saved per track and car class. Set both on this event to enter lap times and
          consumption.{' '}
          {canManage && (
            <AppLink to={`/events/${event.id}/edit`} className={button.link}>
              Edit event
            </AppLink>
          )}
        </Muted>
      </Card>
    );
  }

  const rows = new Map((pace.data ?? []).map((r) => [r.userId, r]));
  const average = averagePace([...rows.values()]);

  return (
    <Card title={`Driver pace · ${event.track} · ${event.carClass}`}>
      {pace.isPending ? (
        <Muted>Loading…</Muted>
      ) : pace.error ? (
        <ErrorText error={pace.error} />
      ) : drivers.length === 0 ? (
        <Muted>Nobody is on this team yet.</Muted>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-text-muted">
                <tr>
                  <th className="py-2 pr-3 font-normal">Driver</th>
                  <th className="py-2 pr-3 font-normal">Race lap</th>
                  <th className="py-2 pr-3 font-normal">Per lap ({unitLabel(event)})</th>
                  <th className="py-2 pr-3 font-normal">Laps per stint</th>
                  <th className="py-2 pr-3 font-normal">Stint length</th>
                  <th className="py-2 font-normal">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <PaceRowView
                    key={d.id}
                    event={event}
                    driver={d}
                    row={rows.get(d.id)}
                    average={average}
                    editable={d.id === me.id || canManage}
                    isMe={d.id === me.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted">
            Laps per stint = whole laps on a full tank ({event.fuelCapacity} {unitLabel(event)}).
            Pace is saved per track and class and reused for future events there.
            {rows.size < drivers.length &&
              (average
                ? ' Drivers without numbers use the team average (marked estimated).'
                : ' Nobody has entered numbers yet.')}
          </p>
        </div>
      )}
    </Card>
  );
}

function PaceRowView({
  event,
  driver,
  row,
  average,
  editable,
  isMe,
}: {
  event: RaceEvent;
  driver: UserSummary;
  row: PaceRow | undefined;
  average: Pace | null;
  editable: boolean;
  isMe: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [lapText, setLapText] = useState(row ? formatLapTime(row.lapMs) : '');
  const [useText, setUseText] = useState(row ? String(row.consumptionPerLap) : '');
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.pace(event.id) });

  const save = useMutation({
    mutationFn: () =>
      savePace(event.id, driver.id, {
        lapMs: parseLapTime(lapText)!,
        consumptionPerLap: Number(useText),
      }),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const clear = useMutation({
    mutationFn: () => deletePace(event.id, driver.id),
    onSuccess: refresh,
  });

  const shown = row ?? average;
  const estimated = !row;
  const laps = shown ? lapsPerStint(event.fuelCapacity, shown.consumptionPerLap) : null;
  const lapMs = parseLapTime(lapText);
  const use = Number(useText);
  const valid = lapMs !== null && lapMs >= 10_000 && use > 0 && use <= 1000;

  return (
    <tr className="border-t border-border align-middle">
      <th scope="row" className="py-2 pr-3 font-normal">
        <span className="flex items-center gap-2">
          <Avatar me={driver} size={22} />
          <span className="font-medium">{nameOf(driver)}</span>
          {isMe && <span className="text-text-muted">(you)</span>}
        </span>
      </th>
      {editing ? (
        <>
          <td className="py-2 pr-3">
            <input
              value={lapText}
              onChange={(e) => setLapText(e.target.value)}
              placeholder="4:00.5"
              aria-label={`Race lap time for ${nameOf(driver)} (minutes:seconds)`}
              className={`${input} w-28`}
            />
          </td>
          <td className="py-2 pr-3">
            <input
              type="number"
              min={0.01}
              max={1000}
              step="any"
              value={useText}
              onChange={(e) => setUseText(e.target.value)}
              aria-label={`${unitLabel(event)} used per lap by ${nameOf(driver)}`}
              className={`${input} w-24`}
            />
          </td>
          <td className="py-2 pr-3 text-text-muted" colSpan={2}>
            {valid
              ? `${lapsPerStint(event.fuelCapacity, use)} laps · ${formatStintLength(
                  stintDurationMs(lapsPerStint(event.fuelCapacity, use), lapMs),
                )}`
              : 'Lap as m:ss.s and use per lap above 0'}
          </td>
          <td className="py-2 text-right whitespace-nowrap">
            <button
              type="button"
              className={button.primary}
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              Save
            </button>{' '}
            <button type="button" className={button.link} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <ErrorText error={save.error} />
          </td>
        </>
      ) : (
        <>
          <td className={`py-2 pr-3 tabular-nums ${estimated ? 'text-text-muted italic' : ''}`}>
            {shown ? formatLapTime(shown.lapMs) : '—'}
          </td>
          <td className={`py-2 pr-3 tabular-nums ${estimated ? 'text-text-muted italic' : ''}`}>
            {shown ? Number(shown.consumptionPerLap.toFixed(2)) : '—'}
          </td>
          <td className={`py-2 pr-3 tabular-nums ${estimated ? 'text-text-muted italic' : ''}`}>
            {laps ?? '—'}
          </td>
          <td className={`py-2 pr-3 tabular-nums ${estimated ? 'text-text-muted italic' : ''}`}>
            {shown && laps ? formatStintLength(stintDurationMs(laps, shown.lapMs)) : '—'}
            {estimated && shown && (
              <span className="ml-2 rounded-full border border-maybe/60 px-1.5 py-0.5 text-[10px] text-maybe not-italic">
                estimated
              </span>
            )}
          </td>
          <td className="py-2 text-right whitespace-nowrap">
            {editable && (
              <>
                <button type="button" className={button.link} onClick={() => setEditing(true)}>
                  {row ? 'Edit' : 'Add pace'}
                </button>
                {row && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className={button.link}
                      disabled={clear.isPending}
                      onClick={() => clear.mutate()}
                    >
                      Clear
                    </button>
                  </>
                )}
              </>
            )}
            <ErrorText error={clear.error} />
          </td>
        </>
      )}
    </tr>
  );
}
