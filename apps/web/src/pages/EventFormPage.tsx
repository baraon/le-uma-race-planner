/**
 * Create or edit an event. The organiser types the green flag as a wall-clock time in a zone
 * they choose (theirs, the track's, or UTC); we convert it to a UTC instant before sending.
 */
import {
  eventEnd,
  formatDateTime,
  fromZonedInput,
  toZonedInput,
  zoneAbbreviation,
  type GroupDetail,
  type Me,
  type RaceEvent,
} from '@le-uma/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { TimeZoneSelect } from '../components/TimeZoneSelect';
import { AppLink, button, Card, ErrorText, input, Muted } from '../components/ui';
import { createEvent, updateEvent } from '../lib/api';
import { useEvent, useGroup, useInvalidateEvents } from '../lib/queries';
import { navigate } from '../lib/router';
import { viewerTimeZone } from '../lib/session';
import { useDocumentTitle } from '../lib/title';

/** Endurance circuits and their local zones, to pre-fill "track time". */
const TRACKS: Record<string, string> = {
  'Circuit de la Sarthe (Le Mans)': 'Europe/Paris',
  'Spa-Francorchamps': 'Europe/Brussels',
  'Sebring International Raceway': 'America/New_York',
  'Autodromo Nazionale Monza': 'Europe/Rome',
  'Autodromo Enzo e Dino Ferrari (Imola)': 'Europe/Rome',
  'Fuji Speedway': 'Asia/Tokyo',
  'Bahrain International Circuit': 'Asia/Bahrain',
  'Lusail International Circuit (Qatar)': 'Asia/Qatar',
  'Algarve International Circuit (Portimão)': 'Europe/Lisbon',
  'Autódromo José Carlos Pace (Interlagos)': 'America/Sao_Paulo',
  'Circuit of the Americas': 'America/Chicago',
  'Silverstone Circuit': 'Europe/London',
  'Circuit Paul Ricard': 'Europe/Paris',
};
const CAR_CLASSES = ['Hypercar', 'LMP2', 'LMP3', 'LMGT3', 'GTE'];

export function NewEventPage({ groupId, me }: { groupId: string; me: Me }) {
  useDocumentTitle('New event');
  const group = useGroup(groupId);
  if (group.isPending) return <Muted>Loading…</Muted>;
  if (group.error) return <ErrorText error={group.error} />;
  if (!group.data.permissions.manageEvents)
    return <ErrorText error={new Error('Only event managers can create events')} />;
  return <EventForm group={group.data} me={me} />;
}

export function EditEventPage({ eventId, me }: { eventId: string; me: Me }) {
  useDocumentTitle('Edit event');
  const event = useEvent(eventId);
  const group = useGroup(event.data?.groupId);
  if (event.isPending || group.isPending) return <Muted>Loading…</Muted>;
  if (event.error || group.error) return <ErrorText error={event.error ?? group.error} />;
  if (!group.data.permissions.manageEvents)
    return <ErrorText error={new Error('Only event managers can edit events')} />;
  return <EventForm group={group.data} me={me} event={event.data} />;
}

function EventForm({ group, me, event }: { group: GroupDetail; me: Me; event?: RaceEvent }) {
  const myZone = viewerTimeZone(me);
  const [teamId, setTeamId] = useState(event?.teamId ?? group.teams[0]?.id ?? '');
  const [name, setName] = useState(event?.name ?? '');
  const [entryZone, setEntryZone] = useState(myZone);
  const [local, setLocal] = useState(event ? toZonedInput(new Date(event.startsAt), myZone) : '');
  const [hours, setHours] = useState(event ? Math.floor(event.durationMinutes / 60) : 6);
  const [minutes, setMinutes] = useState(event ? event.durationMinutes % 60 : 0);
  const [track, setTrack] = useState(event?.track ?? '');
  const [carClass, setCarClass] = useState(event?.carClass ?? '');
  const [trackZone, setTrackZone] = useState<string | null>(event?.trackTimezone ?? null);
  const [minDrivers, setMinDrivers] = useState<number | null>(event?.minDrivers ?? null);
  const invalidate = useInvalidateEvents();

  const durationMinutes = hours * 60 + minutes;
  const startsAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)
    ? fromZonedInput(local, entryZone)
    : null;
  // A wall-clock time skipped by a daylight-saving change gets moved forward; say so.
  const shifted = startsAt !== null && toZonedInput(startsAt, entryZone) !== local;
  const valid =
    !!teamId &&
    name.trim() !== '' &&
    startsAt !== null &&
    durationMinutes >= 15 &&
    durationMinutes <= 2880;

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        startsAt: startsAt!.toISOString(),
        durationMinutes,
        track,
        carClass,
        trackTimezone: trackZone,
        minDrivers,
      };
      return event ? updateEvent(event.id, input) : createEvent(teamId, input);
    },
    onSuccess: async (saved) => {
      await invalidate(group.id, saved.id);
      navigate(`/events/${saved.id}`);
    },
  });

  const entryZones = Array.from(new Set([myZone, ...(trackZone ? [trackZone] : []), 'UTC']));
  const label = 'flex flex-col gap-1 text-sm';

  return (
    <Card title={event ? `Edit ${event.name}` : `New event in ${group.name}`}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            <span className="font-medium">Team</span>
            {event ? (
              <span className="py-2">{event.teamName}</span>
            ) : (
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={input}>
                {group.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={label}>
            <span className="font-medium">Event name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="6 Hours of Spa"
              maxLength={120}
              required
              className={input}
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Green flag</legend>
          <div className="flex flex-wrap gap-2">
            <input
              type="datetime-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              required
              aria-label="Start date and time"
              className={input}
            />
            <label className="flex items-center gap-2 text-sm text-text-muted">
              in
              <select
                value={entryZone}
                onChange={(e) => setEntryZone(e.target.value)}
                className={input}
                aria-label="Timezone of the start time"
              >
                {entryZones.map((z) => (
                  <option key={z} value={z}>
                    {z === myZone ? `${z} (your time)` : z === trackZone ? `${z} (track time)` : z}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {startsAt && (
            <p className="text-sm text-text-muted">
              {shifted && (
                <span className="block text-maybe">
                  <span aria-hidden>⚠ </span>
                  {local.slice(11)} doesn&apos;t exist in {entryZone} that day (clocks go forward);
                  using {toZonedInput(startsAt, entryZone).slice(11)}.
                </span>
              )}
              = {formatDateTime(startsAt, myZone)} {zoneAbbreviation(startsAt, myZone)} for you
              {myZone !== 'UTC' && ` · ${formatDateTime(startsAt, 'UTC')} UTC`}. Finishes{' '}
              {formatDateTime(eventEnd({ startsAt, durationMinutes }), myZone)}{' '}
              {zoneAbbreviation(eventEnd({ startsAt, durationMinutes }), myZone)}.
            </p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Duration</legend>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="number"
              min={0}
              max={48}
              value={hours}
              onChange={(e) => setHours(Math.max(0, Math.min(48, Number(e.target.value) || 0)))}
              aria-label="Hours"
              className={`${input} w-20`}
            />
            h
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              aria-label="Minutes"
              className={input}
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            min
            <span className="ml-2 flex flex-wrap gap-1">
              {[2, 6, 8, 12, 24].map((h) => (
                <button
                  key={h}
                  type="button"
                  className={button.secondary}
                  onClick={() => {
                    setHours(h);
                    setMinutes(0);
                  }}
                >
                  {h} h
                </button>
              ))}
            </span>
          </div>
          {(durationMinutes < 15 || durationMinutes > 2880) && (
            <p className="text-sm text-unavailable">
              <span aria-hidden>⚠ </span>Between 15 minutes and 48 hours, please.
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            <span className="font-medium">Track (optional)</span>
            <input
              value={track}
              list="track-options"
              onChange={(e) => {
                setTrack(e.target.value);
                const zone = TRACKS[e.target.value];
                if (zone && !trackZone) setTrackZone(zone);
              }}
              maxLength={80}
              className={input}
            />
            <datalist id="track-options">
              {Object.keys(TRACKS).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className={label}>
            <span className="font-medium">Car class (optional)</span>
            <input
              value={carClass}
              list="class-options"
              onChange={(e) => setCarClass(e.target.value)}
              maxLength={40}
              className={input}
            />
            <datalist id="class-options">
              {CAR_CLASSES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className={label}>
            <span className="font-medium">Track timezone (optional)</span>
            <TimeZoneSelect value={trackZone} onChange={setTrackZone} allowNone="None" />
          </label>
        </div>

        <label className={`${label} max-w-xs`}>
          <span className="font-medium">Drivers needed at once</span>
          <select
            value={minDrivers ?? ''}
            onChange={(e) => setMinDrivers(e.target.value ? Number(e.target.value) : null)}
            className={input}
          >
            <option value="">At least one (default)</option>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} drivers
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">
            The overview flags any time with fewer drivers available than this.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!valid || save.isPending} className={button.primary}>
            {save.isPending ? 'Saving…' : event ? 'Save changes' : 'Create event'}
          </button>
          <AppLink
            to={event ? `/events/${event.id}` : `/groups/${group.id}`}
            className={button.link}
          >
            Cancel
          </AppLink>
        </div>
        {event &&
          startsAt &&
          (startsAt.getTime() !== new Date(event.startsAt).getTime() ||
            durationMinutes !== event.durationMinutes) && (
            <p className="text-sm text-text-muted">
              Drivers&apos; saved availability keeps its real-world times; any part outside the new
              race window (or off its 15-minute grid) is removed.
            </p>
          )}
        <ErrorText error={save.error} />
      </form>
    </Card>
  );
}
