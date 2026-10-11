import type { Me } from '@lmu/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getHealth } from './lib/api';
import { linkClick, matchRoute, usePath } from './lib/router';
import { useAdoptBrowserTimeZone, useMe } from './lib/session';
import { EditEventPage, NewEventPage } from './pages/EventFormPage';
import { EventPage } from './pages/EventPage';
import { GroupPage } from './pages/GroupPage';
import { HomePage } from './pages/HomePage';
import { InvitePage } from './pages/InvitePage';
import { ProfilePage } from './ProfilePage';
import { SignInPage } from './SignInPage';
import { UserMenu } from './UserMenu';

/** Pages for signed-in users, first match wins. */
const routes: [string, (p: Record<string, string>, me: Me) => ReactNode][] = [
  ['/', (_, me) => <HomePage me={me} />],
  ['/profile', (_, me) => <ProfilePage me={me} />],
  ['/groups/:groupId', (p, me) => <GroupPage key={p.groupId} groupId={p.groupId!} me={me} />],
  ['/groups/:groupId/events/new', (p, me) => <NewEventPage groupId={p.groupId!} me={me} />],
  ['/events/:eventId', (p, me) => <EventPage key={p.eventId} eventId={p.eventId!} me={me} />],
  ['/events/:eventId/edit', (p, me) => <EditEventPage eventId={p.eventId!} me={me} />],
  ['/invite/:token', (p) => <InvitePage token={p.token!} />],
];

function renderRoute(path: string, me: Me): ReactNode {
  for (const [pattern, render] of routes) {
    const params = matchRoute(pattern, path);
    if (params) return render(params, me);
  }
  return <p className="text-sm text-text-muted">Page not found.</p>;
}

export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth });
  const me = useMe();
  const path = usePath();
  useAdoptBrowserTimeZone(me.data);

  const status = health.isPending
    ? { label: 'Checking API…', tone: 'bg-text-muted' }
    : health.data?.db === 'ok'
      ? { label: 'API and database online', tone: 'bg-available' }
      : { label: 'API or database unreachable', tone: 'bg-unavailable' };

  let page;
  if (me.isPending) {
    page = <p className="text-sm text-text-muted">Loading…</p>;
  } else if (!me.data) {
    page = <SignInPage />;
  } else {
    page = renderRoute(path, me.data);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black italic tracking-tight uppercase">
              <a href="/" onClick={linkClick}>
                Le <span className="text-accent-strong">Uma</span> Race Planner
              </a>
            </h1>
            <p className="text-sm text-text-muted">
              Driver availability for Le Mans Ultimate endurance races, in every driver&apos;s
              timezone.
            </p>
          </div>
          {me.data && <UserMenu me={me.data} />}
        </div>
        <div className="livery-stripe h-1.5 -skew-x-[20deg] rounded-sm" aria-hidden />
      </header>

      <main className="flex flex-col gap-8">{page}</main>

      <footer className="mt-auto flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span className="inline-flex items-center gap-2">
          <span className={`size-2 rounded-full ${status.tone}`} aria-hidden />
          {status.label}
        </span>
        <span>Phase 2 · development build {health.data ? `· API ${health.data.version}` : ''}</span>
      </footer>
    </div>
  );
}
