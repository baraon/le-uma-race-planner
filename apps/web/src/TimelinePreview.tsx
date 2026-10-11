/**
 * A static preview of the availability timeline with sample data, so the timezone model can be
 * seen working from day one. Phase 3/4 replace this with the real editor and overview.
 */
import {
  blocksToPaint,
  coverage,
  formatSlotLabel,
  localDayChanged,
  slotCount,
  slotStart,
  zoneAbbreviation,
  type AvailabilityStatus,
  type EventWindow,
  type SlotBlock,
} from '@lmu/shared';
import { useMemo, useState } from 'react';

// Sample: a 6-hour race starting 2026-11-14 18:00 UTC.
const sampleRace: EventWindow = {
  startsAt: new Date('2026-11-14T18:00:00Z'),
  durationMinutes: 360,
};

const sampleDrivers: { name: string; zone: string; blocks: SlotBlock[] }[] = [
  {
    name: 'Baraon',
    zone: 'America/Chicago',
    blocks: [
      { startSlot: 0, endSlot: 12, status: 'available' },
      { startSlot: 12, endSlot: 16, status: 'maybe' },
    ],
  },
  {
    name: 'Lukas',
    zone: 'Europe/Berlin',
    blocks: [
      { startSlot: 0, endSlot: 8, status: 'available' },
      { startSlot: 8, endSlot: 24, status: 'unavailable' },
    ],
  },
  {
    name: 'Mateus',
    zone: 'America/Sao_Paulo',
    blocks: [
      { startSlot: 6, endSlot: 18, status: 'maybe' },
      { startSlot: 18, endSlot: 24, status: 'available' },
    ],
  },
  {
    name: 'Priya',
    zone: 'Asia/Kolkata',
    blocks: [{ startSlot: 14, endSlot: 24, status: 'available' }],
  },
];

const statusStyle: Record<AvailabilityStatus, string> = {
  available: 'bg-available',
  maybe: 'bg-maybe',
  unavailable: 'bg-unavailable',
};

const statusLabel: Record<AvailabilityStatus, string> = {
  available: 'Available',
  maybe: 'Maybe',
  unavailable: 'Not available',
};

export function TimelinePreview({ defaultZone }: { defaultZone: string }) {
  const [zone, setZone] = useState(defaultZone);
  const count = slotCount(sampleRace);

  const rows = useMemo(
    () => sampleDrivers.map((d) => ({ ...d, paint: blocksToPaint(d.blocks, count) })),
    [count],
  );
  const covered = useMemo(
    () =>
      coverage(
        rows.map((r) => r.paint),
        count,
      ),
    [rows, count],
  );

  const zoneOptions = useMemo(
    () => Array.from(new Set([defaultZone, 'UTC', ...sampleDrivers.map((d) => d.zone)])),
    [defaultZone],
  );

  // An axis tick every hour (4 slots); show the weekday when the local date changes.
  const ticks = Array.from({ length: count / 4 + 1 }, (_, h) => {
    const i = h * 4;
    const at = slotStart(sampleRace, i);
    const prev = h === 0 ? null : slotStart(sampleRace, i - 4);
    return {
      i,
      label: formatSlotLabel(
        at,
        zone,
        h === 0 || (prev !== null && localDayChanged(prev, at, zone)),
      ),
    };
  });

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 className="text-lg font-semibold">Availability overview</h2>
          <p className="text-sm text-text-muted">Sample data · 6-hour race, 15-minute slots</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          Show times in
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-text"
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z === defaultZone ? `${z} (you)` : z}
              </option>
            ))}
          </select>
          <span className="text-xs">{zoneAbbreviation(sampleRace.startsAt, zone)}</span>
        </label>
      </div>

      <div className="overflow-x-auto p-5">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[150px_1fr] gap-x-3">
            <div />
            <div className="relative h-6 text-xs text-text-muted">
              {ticks.map((t) => (
                <span
                  key={t.i}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${(t.i / count) * 100}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>

            <div className="py-2 text-xs font-medium text-text-muted">Drivers available</div>
            <div className="flex gap-px py-2" aria-label="Number of available drivers per slot">
              {covered.map((n, i) => (
                <div
                  key={i}
                  title={`${formatSlotLabel(slotStart(sampleRace, i), zone)}: ${n} available`}
                  className={`flex h-6 flex-1 items-center justify-center rounded-sm text-[10px] ${
                    n === 0 ? 'bg-unavailable/30' : n === 1 ? 'bg-maybe/30' : 'bg-available/30'
                  }`}
                >
                  {n}
                </div>
              ))}
            </div>

            {rows.map((r) => (
              <DriverRow key={r.name} row={r} viewerZone={zone} />
            ))}
          </div>

          <ul className="mt-4 flex flex-wrap justify-end gap-4 text-xs text-text-muted">
            {(Object.keys(statusLabel) as AvailabilityStatus[]).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={`size-3 rounded-full ${statusStyle[s]}`} aria-hidden />
                {statusLabel[s]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function DriverRow({
  row,
  viewerZone,
}: {
  row: { name: string; zone: string; paint: (AvailabilityStatus | null)[] };
  viewerZone: string;
}) {
  return (
    <>
      <div className="flex flex-col justify-center py-1.5">
        <span className="text-sm font-medium">{row.name}</span>
        <span className="text-[11px] text-text-muted">
          Green flag {formatSlotLabel(sampleRace.startsAt, row.zone)}{' '}
          {zoneAbbreviation(sampleRace.startsAt, row.zone)}
        </span>
      </div>
      <div className="flex items-center gap-px py-1.5">
        {row.paint.map((s, i) => {
          const at = slotStart(sampleRace, i);
          return (
            <div
              key={i}
              title={`${formatSlotLabel(at, viewerZone)} for you · ${formatSlotLabel(at, row.zone)} for ${row.name} · ${s ? statusLabel[s] : 'No answer'}`}
              className={`h-7 flex-1 rounded-sm ${s ? statusStyle[s] : 'bg-empty'}`}
            />
          );
        })}
      </div>
    </>
  );
}
