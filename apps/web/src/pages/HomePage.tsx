import { formatDateTime, zoneAbbreviation, type Me, type RaceEvent } from '@lmu/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppLink, button, Card, ErrorText, input, Muted, RoleBadge } from '../components/ui';
import { createGroup } from '../lib/api';
import { formatDuration, formatRelative } from '../lib/format';
import { keys, useGroups, useUpcomingEvents } from '../lib/queries';
import { navigate } from '../lib/router';
import { viewerTimeZone } from '../lib/session';

export function HomePage({ me }: { me: Me }) {
  const zone = viewerTimeZone(me);
  const groups = useGroups();
  const upcoming = useUpcomingEvents();

  return (
    <>
      <Card title="Upcoming races">
        {upcoming.isPending ? (
          <Muted>Loading…</Muted>
        ) : upcoming.error ? (
          <ErrorText error={upcoming.error} />
        ) : upcoming.data.length === 0 ? (
          <Muted>
            No races scheduled yet. Event managers can add one from a group&apos;s page.
          </Muted>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {upcoming.data.map((e) => (
              <EventRow key={e.id} event={e} zone={zone} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Your groups">
        {groups.isPending ? (
          <Muted>Loading…</Muted>
        ) : groups.error ? (
          <ErrorText error={groups.error} />
        ) : (
          <div className="flex flex-col gap-4">
            {groups.data.length === 0 ? (
              <Muted>
                You&apos;re not in a group yet. Ask your team for an invite link, or create a group
                and invite them.
              </Muted>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {groups.data.map((g) => (
                  <li key={g.id}>
                    <AppLink
                      to={`/groups/${g.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 hover:border-text-muted"
                    >
                      <span>
                        <span className="block font-medium">{g.name}</span>
                        <span className="text-xs text-text-muted">
                          {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      </span>
                      <RoleBadge role={g.role} />
                    </AppLink>
                  </li>
                ))}
              </ul>
            )}
            <CreateGroupForm />
          </div>
        )}
      </Card>
    </>
  );
}

function EventRow({ event, zone }: { event: RaceEvent; zone: string }) {
  const start = new Date(event.startsAt);
  return (
    <li>
      <AppLink
        to={`/events/${event.id}`}
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 hover:text-accent-strong"
      >
        <span>
          <span className="block font-medium">{event.name}</span>
          <span className="text-xs text-text-muted">
            {event.teamName} · {event.groupName}
            {event.track && ` · ${event.track}`}
          </span>
        </span>
        <span className="text-right text-sm">
          <span className="block">
            {formatDateTime(start, zone)}{' '}
            <span className="text-text-muted">{zoneAbbreviation(start, zone)}</span>
          </span>
          <span className="text-xs text-text-muted">
            {formatRelative(start)} · {formatDuration(event.durationMinutes)}
          </span>
        </span>
      </AppLink>
    </li>
  );
}

function CreateGroupForm() {
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: createGroup,
    onSuccess: async (group) => {
      qc.setQueryData(keys.group(group.id), group);
      await qc.invalidateQueries({ queryKey: keys.groups });
      navigate(`/groups/${group.id}`);
    },
  });

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate(name.trim());
      }}
    >
      <label htmlFor="new-group" className="sr-only">
        New group name
      </label>
      <input
        id="new-group"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New group name"
        maxLength={80}
        className={`${input} min-w-0 flex-1`}
      />
      <button type="submit" disabled={!name.trim() || create.isPending} className={button.primary}>
        Create group
      </button>
      <ErrorText error={create.error} />
    </form>
  );
}
