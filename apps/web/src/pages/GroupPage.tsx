import {
  formatDateTime,
  PERMISSIONS,
  zoneAbbreviation,
  type CreatedInvite,
  type GroupDetail,
  type Me,
  type Member,
  type Permission,
  type Team,
} from '@lmu/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { confirmDialog, promptDialog } from '../components/Dialog';
import { AppLink, button, Card, ErrorText, input, Muted, RoleBadge } from '../components/ui';
import { Avatar } from '../UserMenu';
import * as api from '../lib/api';
import { formatDuration } from '../lib/format';
import { keys, useGroup, useGroupEvents, useGroupMutation, useInvites } from '../lib/queries';
import { navigate } from '../lib/router';
import { viewerTimeZone } from '../lib/session';

const permissionLabels: Record<Permission, string> = {
  manageMembers: 'Members & invites',
  manageTeams: 'Teams',
  manageEvents: 'Events',
  manageAvailability: 'Anyone’s availability',
};

export function GroupPage({ groupId, me }: { groupId: string; me: Me }) {
  const group = useGroup(groupId);

  if (group.isPending) return <Muted>Loading…</Muted>;
  if (group.error) return <ErrorText error={group.error} />;
  const g = group.data;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{g.name}</h2>
        <RoleBadge role={g.role} />
      </div>
      <EventsSection group={g} me={me} />
      <TeamsSection group={g} me={me} />
      <MembersSection group={g} me={me} />
      {g.permissions.manageMembers && <InvitesSection group={g} zone={viewerTimeZone(me)} />}
      <LeaveOrDelete group={g} />
    </>
  );
}

function EventsSection({ group, me }: { group: GroupDetail; me: Me }) {
  const events = useGroupEvents(group.id);
  const zone = viewerTimeZone(me);
  const now = Date.now();

  return (
    <Card
      title="Events"
      action={
        group.permissions.manageEvents &&
        group.teams.length > 0 && (
          <AppLink to={`/groups/${group.id}/events/new`} className={button.primary}>
            New event
          </AppLink>
        )
      }
    >
      {events.isPending ? (
        <Muted>Loading…</Muted>
      ) : events.error ? (
        <ErrorText error={events.error} />
      ) : events.data.length === 0 ? (
        <Muted>
          No events yet.
          {group.permissions.manageEvents &&
            group.teams.length === 0 &&
            ' Create a team first; every event belongs to a team.'}
        </Muted>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {events.data.map((e) => {
            const start = new Date(e.startsAt);
            const finished = start.getTime() + e.durationMinutes * 60_000 < now;
            return (
              <li key={e.id} className={finished ? 'opacity-60' : undefined}>
                <AppLink
                  to={`/events/${e.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 hover:text-accent-strong"
                >
                  <span>
                    <span className="font-medium">{e.name}</span>{' '}
                    <span className="text-xs text-text-muted">
                      {e.teamName}
                      {finished && ' · finished'}
                    </span>
                  </span>
                  <span className="text-sm">
                    {formatDateTime(start, zone)}{' '}
                    <span className="text-text-muted">
                      {zoneAbbreviation(start, zone)} · {formatDuration(e.durationMinutes)}
                    </span>
                  </span>
                </AppLink>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TeamsSection({ group, me }: { group: GroupDetail; me: Me }) {
  const [name, setName] = useState('');
  const create = useGroupMutation(group.id, (n: string) => api.createTeam(group.id, n));
  const byId = new Map(group.members.map((m) => [m.user.id, m]));

  return (
    <Card title="Teams">
      <div className="flex flex-col gap-4">
        {group.teams.length === 0 ? (
          <Muted>No teams yet.</Muted>
        ) : (
          <ul className="flex flex-col gap-3">
            {group.teams.map((t) => (
              <TeamRow key={t.id} team={t} group={group} me={me} members={byId} />
            ))}
          </ul>
        )}
        {group.permissions.manageTeams && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate(name.trim(), { onSuccess: () => setName('') });
            }}
          >
            <label htmlFor="new-team" className="sr-only">
              New team name
            </label>
            <input
              id="new-team"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New team name, e.g. Hypercar #7"
              maxLength={80}
              className={`${input} min-w-0 flex-1`}
            />
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className={button.secondary}
            >
              Add team
            </button>
            <ErrorText error={create.error} />
          </form>
        )}
      </div>
    </Card>
  );
}

function TeamRow({
  team,
  group,
  me,
  members,
}: {
  team: Team;
  group: GroupDetail;
  me: Me;
  members: Map<string, Member>;
}) {
  const onTeam = team.memberIds.includes(me.id);
  const toggle = useGroupMutation(group.id, () =>
    onTeam ? api.leaveTeam(team.id) : api.joinTeam(team.id),
  );
  const rename = useGroupMutation(group.id, (n: string) => api.renameTeam(team.id, n));
  const remove = useGroupMutation(group.id, () => api.deleteTeam(team.id));
  const qc = useQueryClient();

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{team.name}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggle.mutate(undefined)}
            disabled={toggle.isPending}
            className={onTeam ? button.secondary : button.primary}
          >
            {onTeam ? 'Leave team' : 'Join team'}
          </button>
          {group.permissions.manageTeams && (
            <>
              <button
                type="button"
                className={button.link}
                onClick={async () => {
                  const n = await promptDialog({
                    title: 'Rename team',
                    label: 'Team name',
                    initial: team.name,
                    maxLength: 80,
                    confirmLabel: 'Rename',
                  });
                  if (n && n !== team.name) rename.mutate(n);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className={button.link}
                onClick={async () => {
                  if (
                    await confirmDialog({
                      title: `Delete team “${team.name}”?`,
                      message: 'Its events and everyone’s availability for them are deleted too.',
                      confirmLabel: 'Delete team',
                      danger: true,
                    })
                  ) {
                    remove.mutate(undefined, {
                      onSuccess: () =>
                        qc.invalidateQueries({ queryKey: keys.groupEvents(group.id) }),
                    });
                  }
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {team.memberIds.length === 0 ? (
        <span className="text-xs text-text-muted">No drivers yet.</span>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {team.memberIds.map((id) => {
            const m = members.get(id);
            if (!m) return null;
            return (
              <li key={id} className="flex items-center gap-1.5 text-sm">
                <Avatar me={m.user} size={20} />
                {m.user.displayName ?? m.user.username}
              </li>
            );
          })}
        </ul>
      )}
      <ErrorText error={toggle.error ?? rename.error ?? remove.error} />
    </li>
  );
}

function MembersSection({ group, me }: { group: GroupDetail; me: Me }) {
  const isOwner = group.role === 'owner';
  return (
    <Card title={`Members (${group.memberCount})`}>
      <ul className="flex flex-col divide-y divide-border">
        {group.members.map((m) => (
          <MemberRow key={m.user.id} member={m} group={group} me={me} isOwner={isOwner} />
        ))}
      </ul>
      {isOwner && (
        <p className="mt-3 text-xs text-text-muted">
          Give admins only what they need. You always have every permission as the owner.
        </p>
      )}
    </Card>
  );
}

function MemberRow({
  member,
  group,
  me,
  isOwner,
}: {
  member: Member;
  group: GroupDetail;
  me: Me;
  isOwner: boolean;
}) {
  const setPerms = useGroupMutation(group.id, (p: Member['permissions']) =>
    api.setPermissions(group.id, member.user.id, p),
  );
  const remove = useGroupMutation(group.id, () => api.removeMember(group.id, member.user.id));
  const zone = member.user.timezone;
  const canRemove =
    member.role !== 'owner' &&
    member.user.id !== me.id &&
    group.permissions.manageMembers &&
    (member.role === 'member' || isOwner);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Avatar me={member.user} size={32} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {member.user.displayName ?? member.user.username}
                {member.user.id === me.id && <span className="text-text-muted"> (you)</span>}
              </span>
              <RoleBadge role={member.role} />
            </div>
            <span className="text-xs text-text-muted">
              {zone ? `${zone} · ${zoneAbbreviation(new Date(), zone)}` : 'Timezone not set'}
            </span>
          </div>
        </div>
        {canRemove && (
          <button
            type="button"
            className={button.link}
            disabled={remove.isPending}
            onClick={async () => {
              const who = member.user.displayName ?? member.user.username;
              const ok = await confirmDialog({
                title: `Remove ${who}?`,
                message: `${who} leaves ${group.name} and its teams. They can come back with a new invite link.`,
                confirmLabel: 'Remove',
                danger: true,
              });
              if (ok) remove.mutate(undefined);
            }}
          >
            Remove
          </button>
        )}
      </div>

      {isOwner && member.role !== 'owner' && (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 pl-11 text-sm">
          <legend className="sr-only">
            Admin permissions for {member.user.displayName ?? member.user.username}
          </legend>
          {PERMISSIONS.map((p) => (
            <label key={p} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={member.permissions[p]}
                disabled={setPerms.isPending}
                onChange={(e) => setPerms.mutate({ ...member.permissions, [p]: e.target.checked })}
              />
              {permissionLabels[p]}
            </label>
          ))}
        </fieldset>
      )}
      {!isOwner && member.role === 'admin' && (
        <span className="pl-11 text-xs text-text-muted">
          Manages:{' '}
          {PERMISSIONS.filter((p) => member.permissions[p])
            .map((p) => permissionLabels[p])
            .join(', ')}
        </span>
      )}
      <ErrorText error={setPerms.error ?? remove.error} />
    </li>
  );
}

const expiryChoices = [
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'Never', hours: null },
] as const;
const useChoices = [1, 5, 10, 25, null] as const;

function InvitesSection({ group, zone }: { group: GroupDetail; zone: string }) {
  const [expires, setExpires] = useState<number | null>(24 * 7);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const invites = useInvites(group.id, true);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.invites(group.id) });

  const create = useMutation({
    mutationFn: () => api.createInvite(group.id, { expiresInHours: expires, maxUses }),
    onSuccess: async (invite) => {
      setCreated(invite);
      setCopied(false);
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeInvite(group.id, id),
    onSuccess: async (_, id) => {
      if (created?.id === id) setCreated(null);
      await refresh();
    },
  });

  const link = created ? `${window.location.origin}/invite/${created.token}` : null;
  const now = Date.now();

  return (
    <Card title="Invite links">
      <div className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-end gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">Expires after</span>
            <select
              value={expires ?? ''}
              onChange={(e) => setExpires(e.target.value ? Number(e.target.value) : null)}
              className={input}
            >
              {expiryChoices.map((c) => (
                <option key={c.label} value={c.hours ?? ''}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">Max uses</span>
            <select
              value={maxUses ?? ''}
              onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)}
              className={input}
            >
              {useChoices.map((n) => (
                <option key={n ?? 'unlimited'} value={n ?? ''}>
                  {n ?? 'No limit'}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={create.isPending} className={button.primary}>
            Create invite link
          </button>
        </form>
        <ErrorText error={create.error} />

        {link && (
          <div className="flex flex-col gap-2 rounded-lg border border-accent/50 bg-accent/10 p-3">
            <span className="text-sm">
              Share this link with your drivers. It&apos;s shown only once, so copy it now.
            </span>
            <div className="flex flex-wrap gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                aria-label="Invite link"
                className={`${input} min-w-0 flex-1 font-mono text-xs`}
              />
              <button
                type="button"
                className={button.secondary}
                onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {invites.data && invites.data.length > 0 && (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {invites.data.map((i) => {
              const expired = i.expiresAt !== null && new Date(i.expiresAt).getTime() <= now;
              const usedUp = i.maxUses !== null && i.useCount >= i.maxUses;
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className={expired || usedUp ? 'text-text-muted line-through' : undefined}>
                    Used {i.useCount}
                    {i.maxUses !== null && ` of ${i.maxUses}`} ·{' '}
                    {i.expiresAt
                      ? `expires ${formatDateTime(new Date(i.expiresAt), zone)}`
                      : 'never expires'}
                  </span>
                  <button
                    type="button"
                    className={button.link}
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(i.id)}
                  >
                    Revoke
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ErrorText error={revoke.error ?? invites.error} />
      </div>
    </Card>
  );
}

function LeaveOrDelete({ group }: { group: GroupDetail }) {
  const qc = useQueryClient();
  const isOwner = group.role === 'owner';
  const action = useMutation({
    mutationFn: () => (isOwner ? api.deleteGroup(group.id) : api.leaveGroup(group.id)),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: keys.group(group.id) });
      await qc.invalidateQueries({ queryKey: keys.groups });
      await qc.invalidateQueries({ queryKey: keys.upcoming });
      navigate('/');
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={button.danger}
        disabled={action.isPending}
        onClick={async () => {
          const ok = await confirmDialog(
            isOwner
              ? {
                  title: `Delete “${group.name}”?`,
                  message: 'This deletes it for everyone: all its teams, events and availability.',
                  confirmLabel: 'Delete group',
                  danger: true,
                }
              : {
                  title: `Leave “${group.name}”?`,
                  message: 'You’ll need a new invite link to come back.',
                  confirmLabel: 'Leave group',
                  danger: true,
                },
          );
          if (ok) action.mutate();
        }}
      >
        {isOwner ? 'Delete group' : 'Leave group'}
      </button>
      <ErrorText error={action.error} />
    </div>
  );
}
