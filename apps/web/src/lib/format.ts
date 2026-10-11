/** "6 h", "2 h 30 min", "45 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "in 3 days", "in 5 hours", "2 hours ago": the gap between two instants, no zones involved. */
export function formatRelative(instant: Date, now = new Date()): string {
  const minutes = Math.round((instant.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(minutes);
  if (abs < 60) return relative.format(minutes, 'minute');
  if (abs < 48 * 60) return relative.format(Math.round(minutes / 60), 'hour');
  return relative.format(Math.round(minutes / (24 * 60)), 'day');
}
