import {
  eventEnd,
  formatDateTime,
  formatSlotLabel,
  localDayChanged,
  zoneAbbreviation,
  type Me,
  type RaceEvent,
  type UserSummary,
} from '@lmu/shared';
import { useMutation } from '@tanstack/react-query';
import { AppLink, button, Card, ErrorText, Muted } from '../components/ui';
import { Avatar } from '../UserMenu';
import { deleteEvent } from '../lib/api';
import { formatDuration, formatRelative } from '../lib/format';
import { useEvent, useGroup, useInvalidateEvents } from '../lib/queries';
import { navigate } from '../lib/router';
import { viewerTimeZone } from '../lib/session';
import { AvailabilitySection } from './AvailabilityEditor';

function raceWindow(e: RaceEvent) {
  const start = new Date(e.startsAt);
  return { start, end: eventEnd({ startsAt: start, durationMinutes: e.durationMinutes }) };
}

/**
 * The chequered flag, short: "22:00 CDT" on the same local day, "Tue 05:00 GMT+2" otherwise,
 * and the start's zone name too if the clocks changed mid-race.
 */
function formatSpanEnd(start: Date, end: Date, zone: string, abbreviateStart = true) {
  const startAbbr = zoneAbbreviation(start, zone);
  const endAbbr = zoneAbbreviation(end, zone);
  return `${formatSlotLabel(end, zone, localDayChanged(start, end, zone))} ${endAbbr}${
    abbreviateStart && startAbbr !== endAbbr ? ` (starts ${startAbbr})` : ''
  }`;
}

function TimeCell({ at, zone }: { at: Date; zone: string }) {
  return (
    <>
      {formatDateTime(at, zone)}{' '}
      <span className="text-text-muted">{zoneAbbreviation(at, zone)}</span>
    </>
  );
}

export function EventPage({ eventId, me }: { eventId: string; me: Me }) {
  const event = useEvent(eventId);
  const group = useGroup(event.data?.groupId);
  const invalidate = useInvalidateEvents();
  const remove = useMutation({
    mutationFn: () => deleteEvent(eventId),
    onSuccess: async () => {
      await invalidate(event.data!.groupId, eventId);
      navigate(`/groups/${event.data!.groupId}`);
    },
  });

  if (event.isPending) return <Muted>Loading…</Muted>;
  if (event.error) return <ErrorText error={event.error} />;
  const e = event.data;
  const { start, end } = raceWindow(e);
  const zone = viewerTimeZone(me);
  const canEdit = group.data?.permissions.manageEvents ?? false;

  const otherZones: { label: string; zone: string }[] = [
    ...(e.trackTimezone && e.trackTimezone !== zone
      ? [{ label: 'Track time', zone: e.trackTimezone }]
      : []),
    ...(zone !== 'UTC' ? [{ label: 'UTC', zone: 'UTC' }] : []),
  ];

  const team = group.data?.teams.find((t) => t.id === e.teamId);
  const drivers: UserSummary[] = (team?.memberIds ?? [])
    .map((id) => group.data?.members.find((m) => m.user.id === id)?.user)
    .filter((u): u is UserSummary => u !== undefined);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-muted">
            <AppLink to={`/groups/${e.groupId}`} className={button.link}>
              {e.groupName}
            </AppLink>{' '}
            · {e.teamName}
          </p>
          <h2 className="text-2xl font-semibold">{e.name}</h2>
          <p className="text-sm text-text-muted">
            {[
              e.track,
              e.carClass,
              formatDuration(e.durationMinutes),
              e.minDrivers && `${e.minDrivers} drivers needed at once`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-3">
            <span className="text-text-muted">Green flag</span>{' '}
            <span className="font-medium">{formatDateTime(start, zone)}</span>
            <span className="text-text-muted"> → </span>
            {formatSpanEnd(start, end, zone)}{' '}
            <span className="text-sm text-text-muted">({formatRelative(start)})</span>
          </p>
          {otherZones.length > 0 && (
            <p className="text-xs text-text-muted">
              {otherZones.map((z, i) => (
                <span key={z.zone}>
                  {i > 0 && ' · '}
                  {z.label}{' '}
                  <span className="text-text">
                    {formatSlotLabel(start, z.zone)} → {formatSpanEnd(start, end, z.zone, false)}
                  </span>
                </span>
              ))}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <AppLink to={`/events/${e.id}/edit`} className={button.secondary}>
              Edit
            </AppLink>
            <button
              type="button"
              className={button.danger}
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(`Delete “${e.name}”? Drivers’ availability for it is deleted too.`)
                ) {
                  remove.mutate();
                }
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <ErrorText error={remove.error} />

      {group.data && <AvailabilitySection event={e} group={group.data} me={me} />}

      <Card title="Race times for each driver">
        {group.isPending ? (
          <Muted>Loading…</Muted>
        ) : drivers.length === 0 ? (
          <Muted>
            Nobody is on this team yet. Drivers join teams from the{' '}
            <AppLink to={`/groups/${e.groupId}`} className={button.link}>
              group page
            </AppLink>
            .
          </Muted>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {drivers.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex items-center gap-2">
                  <Avatar me={u} size={24} />
                  <span className="font-medium">{u.displayName ?? u.username}</span>
                </span>
                <span className="text-right text-sm">
                  {u.timezone ? (
                    <>
                      <TimeCell at={start} zone={u.timezone} />
                      <span className="block text-xs text-text-muted">
                        until <TimeCell at={end} zone={u.timezone} />
                      </span>
                    </>
                  ) : (
                    <span className="text-text-muted">Timezone not set</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
