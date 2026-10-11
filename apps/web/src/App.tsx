import { detectTimeZone } from '@lmu/shared';
import { useQuery } from '@tanstack/react-query';
import { getHealth } from './lib/api';
import { TimelinePreview } from './TimelinePreview';

export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth });
  const zone = detectTimeZone();

  const status = health.isPending
    ? { label: 'Checking API…', tone: 'bg-text-muted' }
    : health.data?.db === 'ok'
      ? { label: 'API and database online', tone: 'bg-available' }
      : { label: 'API or database unreachable', tone: 'bg-unavailable' };

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold italic tracking-tight">Le Mans Race Planner</h1>
          <p className="text-sm text-text-muted">
            Driver availability for Le Mans Ultimate endurance races, in every driver&apos;s
            timezone.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted">
          <span className={`size-2 rounded-full ${status.tone}`} aria-hidden />
          {status.label}
        </span>
      </header>

      <TimelinePreview defaultZone={zone} />

      <footer className="mt-auto text-xs text-text-muted">
        Phase 0 · development build {health.data ? `· API ${health.data.version}` : ''}
      </footer>
    </div>
  );
}
