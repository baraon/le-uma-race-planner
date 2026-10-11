import { useQuery } from '@tanstack/react-query';
import { getHealth } from './lib/api';
import { linkClick, usePath } from './lib/router';
import { useAdoptBrowserTimeZone, useMe, viewerTimeZone } from './lib/session';
import { ProfilePage } from './ProfilePage';
import { SignInPage } from './SignInPage';
import { TimelinePreview } from './TimelinePreview';
import { UserMenu } from './UserMenu';

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
  } else if (path === '/profile') {
    page = <ProfilePage me={me.data} />;
  } else {
    page = <TimelinePreview defaultZone={viewerTimeZone(me.data)} />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold italic tracking-tight">
            <a href="/" onClick={linkClick}>
              Le Mans Race Planner
            </a>
          </h1>
          <p className="text-sm text-text-muted">
            Driver availability for Le Mans Ultimate endurance races, in every driver&apos;s
            timezone.
          </p>
        </div>
        {me.data && <UserMenu me={me.data} />}
      </header>

      <main className="flex flex-col gap-8">{page}</main>

      <footer className="mt-auto flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span className="inline-flex items-center gap-2">
          <span className={`size-2 rounded-full ${status.tone}`} aria-hidden />
          {status.label}
        </span>
        <span>Phase 1 · development build {health.data ? `· API ${health.data.version}` : ''}</span>
      </footer>
    </div>
  );
}
