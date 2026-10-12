/**
 * Editor-only painting helpers. Availability is stored and painted in 15-minute slots; long
 * races wrap the timeline onto several rows.
 */
import type { AvailabilityStatus, Paint } from '@le-uma/shared';

/** Paints slots `a` through `b` (inclusive, either order) with `status`. */
export function paintRange(
  paint: Paint,
  a: number,
  b: number,
  status: AvailabilityStatus | null,
): (AvailabilityStatus | null)[] {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  return paint.map((s, i) => (i >= from && i <= to ? status : s));
}

/** Slots per row: races up to 8 hours fit on one row; longer ones wrap every 6 hours. */
export function rowsFor(count: number): { start: number; end: number }[] {
  const perRow = count <= 32 ? count : 24;
  const rows: { start: number; end: number }[] = [];
  for (let start = 0; start < count; start += perRow) {
    rows.push({ start, end: Math.min(start + perRow, count) });
  }
  return rows;
}
