/**
 * Timezone helpers. Timezones only exist at the edges: when a person reads or enters a time.
 * Everything is IANA zone names (e.g. "America/Chicago"), never fixed offsets like "UTC-5",
 * which break at daylight-saving changes. Built on the platform's Intl API, which ships the
 * IANA database in every modern browser and Node.
 */

/** Accepts IANA names ("Europe/Berlin", "UTC"); rejects raw offsets ("-05:00", "UTC-5"). */
const IANA_NAME = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || !IANA_NAME.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The viewer's zone from the browser/OS, falling back to UTC. */
export function detectTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock fields of `instant` as seen in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, fmt);
  }
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    fmt.formatToParts(instant).find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
}

/** "Sat 14:00" style label in the given zone (24-hour clock). */
export function formatSlotLabel(instant: Date, timeZone: string, withDay = true): string {
  const p = zonedParts(instant, timeZone);
  const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return withDay ? `${p.weekday} ${time}` : time;
}

/** Short zone name at that instant, e.g. "CDT", "GMT+2", "GMT+5:30". Changes across DST. */
export function zoneAbbreviation(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(
    instant,
  );
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

/** Offset from UTC in minutes at that instant (e.g. -300 for CDT, 330 for India). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const floored = Math.floor(instant.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - floored) / 60_000);
}

/** True when the local calendar date differs between two instants in `timeZone`. */
export function localDayChanged(a: Date, b: Date, timeZone: string): boolean {
  const pa = zonedParts(a, timeZone);
  const pb = zonedParts(b, timeZone);
  return pa.year !== pb.year || pa.month !== pb.month || pa.day !== pb.day;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Sat 14 Nov 2026, 18:00" in the given zone (24-hour clock). */
export function formatDateTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** The instant as a wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` (the datetime-local format). */
export function toZonedInput(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const HOUR_MS = 3_600_000;

/**
 * The instant a wall-clock time "YYYY-MM-DDTHH:mm" happens in `timeZone`. Around daylight-saving
 * changes: a time that happens twice (clocks go back) resolves to the first one; a time that
 * never happens (clocks go forward) moves forward by the gap, e.g. 02:30 → 03:30.
 */
export function fromZonedInput(local: string, timeZone: string): Date {
  const m = LOCAL_INPUT.exec(local);
  if (!m) throw new RangeError(`Expected YYYY-MM-DDTHH:mm, got "${local}"`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);

  // Offsets in force half a day either side cover any single transition.
  const before = zoneOffsetMinutes(new Date(wall - 12 * HOUR_MS), timeZone);
  const after = zoneOffsetMinutes(new Date(wall + 12 * HOUR_MS), timeZone);
  const matches = [...new Set([before, after])]
    .map((offset) => new Date(wall - offset * 60_000))
    .filter((t) => toZonedInput(t, timeZone) === local)
    .sort((a, b) => a.getTime() - b.getTime());

  return matches[0] ?? new Date(wall - before * 60_000);
}
