/**
 * Editor-only painting helpers. Availability is always stored in 15-minute slots; for long races
 * the editor paints in bigger steps (30 min, 1 h) aligned to the green flag, and wraps the
 * timeline onto several rows.
 */
import type { AvailabilityStatus, Paint } from '@lmu/shared';

/** Brush sizes, in slots (15 min each). */
export const BRUSH_STEPS = [1, 2, 4] as const;
export type BrushStep = (typeof BRUSH_STEPS)[number];

/** 30-minute brush from 12 hours, 1-hour brush from 24 hours. */
export function defaultStep(slotCount: number): BrushStep {
  if (slotCount >= 96) return 4;
  if (slotCount >= 48) return 2;
  return 1;
}

/** The chunk [from, to) of `step` slots, counted from the green flag, that contains slot `i`. */
export function chunkOf(i: number, step: number, count: number): [number, number] {
  const from = Math.floor(i / step) * step;
  return [from, Math.min(from + step, count)];
}

/** Paints every chunk between slots `a` and `b` (either order) with `status`. */
export function paintChunks(
  paint: Paint,
  a: number,
  b: number,
  step: number,
  status: AvailabilityStatus | null,
): (AvailabilityStatus | null)[] {
  const from = chunkOf(Math.min(a, b), step, paint.length)[0];
  const to = chunkOf(Math.max(a, b), step, paint.length)[1];
  return paint.map((s, i) => (i >= from && i < to ? status : s));
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
