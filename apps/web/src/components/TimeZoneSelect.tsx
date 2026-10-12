import { zoneOffsetMinutes } from '@le-uma/shared';
import { useMemo } from 'react';
import { input } from './ui';

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Every IANA zone the browser knows, labelled with its current UTC offset. */
function useZoneOptions(current: string | null) {
  return useMemo(() => {
    const now = new Date();
    const names = new Set(Intl.supportedValuesOf('timeZone'));
    names.add('UTC');
    if (current) names.add(current); // a saved zone may be an alias the list doesn't include
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((zone) => ({ zone, label: `${zone} (${formatOffset(zoneOffsetMinutes(now, zone))})` }));
  }, [current]);
}

export function TimeZoneSelect({
  id,
  value,
  onChange,
  allowNone,
}: {
  id?: string;
  value: string | null;
  onChange: (zone: string | null) => void;
  /** Adds a "none" choice (for optional fields). */
  allowNone?: string;
}) {
  const options = useZoneOptions(value);
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={input}
    >
      {allowNone !== undefined && <option value="">{allowNone}</option>}
      {options.map((o) => (
        <option key={o.zone} value={o.zone}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
