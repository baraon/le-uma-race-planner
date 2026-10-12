/**
 * Stint timeline: one row per driver across the whole race, each stint a block at its exact time,
 * a row of pit-stop markers, and each driver's availability tinted behind their row. Blocks link
 * to their row in the stint table. Positions are proportional to real time (stints are exact
 * instants, CLAUDE.md rule 2); the axis labels follow the chosen display zone.
 */
import {
  availabilityDuring,
  eventEnd,
  formatSlotLabel,
  formatStintLength,
  localDayChanged,
  zoneAbbreviation,
  type EventWindow,
  type Paint,
  type PlanResult,
  type PlannedStint,
  type Stint,
  type UserSummary,
} from '@le-uma/shared';
import { stintStatus } from '../components/StintStatus';
import { TimeAxis } from '../components/Timeline';
import { Card } from '../components/ui';
import { useNow } from '../lib/now';

const nameOf = (u: UserSummary) => u.displayName ?? u.username;

/** Groups a driver's stints into runs of back-to-back stints (a double is one run of two). */
function runsOf(stints: PlannedStint[]): PlannedStint[][] {
  const runs: PlannedStint[][] = [];
  for (const s of stints) {
    const last = runs.at(-1);
    if (last && last.at(-1)!.index === s.index - 1) last.push(s);
    else runs.push([s]);
  }
  return runs;
}

const tint: Record<string, string> = {
  available: 'bg-available/15',
  maybe: 'bg-maybe/15',
  unavailable: 'bg-unavailable/20',
};

export function StintTimeline({
  w,
  plan,
  stints,
  drivers,
  people,
  paintOf,
  zone,
}: {
  w: EventWindow;
  plan: PlanResult;
  stints: Stint[];
  drivers: UserSummary[];
  people: Map<string, UserSummary>;
  paintOf: (userId: string) => Paint;
  zone: string;
}) {
  const now = useNow();
  const start = w.startsAt.getTime();
  const total = eventEnd(w).getTime() - start;
  const pct = (ms: number) => `${(Math.max(0, Math.min(total, ms - start)) / total) * 100}%`;
  const width = (ms: number) => `${(Math.max(0, ms) / total) * 100}%`;
  const running = plan.stints.filter((s) => !s.afterFlag);

  // Rows: team drivers, plus anyone planned who has since left the team, plus "Unassigned".
  const rowIds = [...drivers.map((d) => d.id)];
  for (const s of stints) if (s.driverId && !rowIds.includes(s.driverId)) rowIds.push(s.driverId);
  const hasUnassigned = running.some((s) => !s.driverId);
  const nowMs = now.getTime();
  const showNow = nowMs >= start && nowMs < start + total;
  const stops = running.filter((s) => s.pitMs > 0);

  return (
    <div className="lg:sticky lg:top-2 lg:z-20 lg:shadow-2xl">
      <Card title="Stint timeline">
        {running.length === 0 ? (
          <p className="text-sm text-text-muted">
            The timeline appears once the plan has timed stints.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-[110px_1fr] items-center gap-x-3 gap-y-1.5">
              <div />
              <TimeAxis window={w} zone={zone} />

              <span className="text-xs text-text-muted">Pit stops</span>
              <div
                className="relative h-6 rounded-md bg-surface-raised"
                role="img"
                aria-label={`${stops.length} pit stops`}
              >
                {stops.map((s) => (
                  <span
                    key={s.index}
                    className="absolute inset-y-1 min-w-[2px] rounded-sm bg-accent-strong"
                    style={{ left: pct(s.end.getTime()), width: width(s.pitMs) }}
                    title={`Stop after stint ${s.index + 1}: ${(s.pitMs / 1000).toFixed(1)} s at ${formatSlotLabel(s.end, zone)}`}
                  />
                ))}
              </div>

              {[
                ...rowIds.map((id) => ({ id, user: people.get(id) })),
                ...(hasUnassigned ? [{ id: null, user: undefined }] : []),
              ].map(({ id, user }) => {
                const mine = running.filter((s) => s.driverId === id);
                const name = id === null ? 'Unassigned' : user ? nameOf(user) : 'Former member';
                const paint = id ? paintOf(id) : [];
                return (
                  <div key={id ?? 'unassigned'} className="contents">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <div className="relative h-9 overflow-hidden rounded-md bg-surface-raised">
                      {/* Availability behind the row (decorative; conflicts are on the blocks). */}
                      <div className="absolute inset-0 flex" aria-hidden>
                        {paint.map((st, k) => (
                          <span key={k} className={`h-full flex-1 ${st ? tint[st] : ''}`} />
                        ))}
                      </div>
                      <ul
                        aria-label={`${name}: ${mine.length} stint${mine.length === 1 ? '' : 's'}`}
                      >
                        {runsOf(mine).map((run) => {
                          const first = run[0]!;
                          const last = run.at(-1)!;
                          const from = first.start.getTime();
                          const span = last.end.getTime() - from;
                          // The worst status of any stint in the run decides the icon.
                          const checks = run.map((s) =>
                            id ? availabilityDuring(w, paint, s.start, s.end) : 'ok',
                          );
                          const check =
                            (['unavailable', 'maybe', 'none'] as const).find((c) =>
                              checks.includes(c),
                            ) ?? 'ok';
                          const conflict = check !== 'ok';
                          const estimated = run.some((s) => s.estimated);
                          const what =
                            run.length === 1
                              ? `Stint ${first.index + 1}`
                              : `Stints ${first.index + 1}–${last.index + 1} (${run.length} in a row)`;
                          const when = `${formatSlotLabel(first.start, zone)}–${formatSlotLabel(last.end, zone, localDayChanged(first.start, last.end, zone))} ${zoneAbbreviation(first.start, zone)}, ${formatStintLength(span)}`;
                          const theirZone = id ? people.get(id)?.timezone : null;
                          return (
                            <li
                              key={first.index}
                              className="absolute inset-y-1"
                              style={{ left: pct(from), width: width(span) }}
                            >
                              <a
                                href={`#stint-${first.index + 1}`}
                                onClick={(e) => {
                                  // Scroll to the stint's row without changing the URL (the
                                  // hash belongs to the tabs), and flash it so it's easy to spot.
                                  e.preventDefault();
                                  const row = document.getElementById(`stint-${first.index + 1}`);
                                  if (!row) return;
                                  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  row.classList.add('bg-accent/15');
                                  setTimeout(() => row.classList.remove('bg-accent/15'), 1600);
                                }}
                                aria-label={`${what}: ${when}${conflict ? `, driver ${stintStatus[check].label}` : ''}${estimated ? ', estimated pace' : ''}`}
                                title={`${what}: ${when}${theirZone ? ` · starts ${formatSlotLabel(first.start, theirZone)} their time` : ''}`}
                                className={`relative flex h-full items-center justify-center overflow-hidden rounded text-[10px] font-semibold text-white ${
                                  conflict
                                    ? 'bg-accent/70 ring-2 ring-unavailable ring-inset'
                                    : 'bg-accent'
                                } ${estimated ? 'border border-dashed border-white/60' : ''} hover:brightness-110`}
                              >
                                {/* A thin divider at each pit stop inside a multi-stint run. */}
                                {run.slice(1).map((s) => (
                                  <span
                                    key={s.index}
                                    aria-hidden
                                    className="absolute inset-y-0 w-px bg-bg/70"
                                    style={{
                                      left: `${((s.start.getTime() - from) / span) * 100}%`,
                                    }}
                                  />
                                ))}
                                {conflict && <span aria-hidden>{stintStatus[check].glyph}</span>}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
            {showNow && (
              <p className="mt-2 text-xs text-accent-strong">
                Now: {formatSlotLabel(now, zone)} · stint{' '}
                {(() => {
                  const current = running.find(
                    (s) => s.start.getTime() <= nowMs && nowMs < s.end.getTime(),
                  );
                  return current ? current.index + 1 : 'none (pit stop)';
                })()}
              </p>
            )}
            <ul className="mt-4 flex flex-wrap gap-4 text-xs text-text-muted">
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-5 rounded-sm bg-accent" aria-hidden /> Stint
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-1 rounded-sm bg-accent-strong" aria-hidden /> Pit stop
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  className="h-3 w-5 rounded-sm bg-accent/70 ring-2 ring-unavailable ring-inset"
                  aria-hidden
                />
                ✕ driver not available · ⚠ maybe or no answer
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  className="h-3 w-5 rounded-sm border border-dashed border-white/60 bg-accent"
                  aria-hidden
                />{' '}
                Estimated pace
              </li>
              <li className="flex items-center gap-1.5">
                Behind rows:
                <span className="h-3 w-4 rounded-sm bg-available/40" aria-hidden /> available
                <span className="h-3 w-4 rounded-sm bg-maybe/40" aria-hidden /> maybe
                <span className="h-3 w-4 rounded-sm bg-unavailable/40" aria-hidden /> not available
              </li>
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
