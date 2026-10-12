/**
 * One icon for "can this driver make this stint?": ✓ available, ⚠ maybe or no answer, ✕ not
 * available. Shape and color both carry the meaning, and there's always a text label.
 */
import type { StintAvailability } from '@le-uma/shared';

export const stintStatus: Record<
  StintAvailability,
  { glyph: string; label: string; tone: string }
> = {
  ok: { glyph: '✓', label: 'available', tone: 'text-available' },
  maybe: { glyph: '⚠', label: 'marked maybe', tone: 'text-maybe' },
  none: { glyph: '⚠', label: 'hasn’t answered', tone: 'text-text-muted' },
  unavailable: { glyph: '✕', label: 'not available', tone: 'text-unavailable' },
};

export function StintStatusIcon({ check, who }: { check: StintAvailability; who: string }) {
  const s = stintStatus[check];
  const text = `${who} ${s.label}`;
  return (
    <span
      className={`inline-flex size-6 items-center justify-center text-base font-bold ${s.tone}`}
      title={text}
    >
      <span aria-hidden>{s.glyph}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
