/**
 * Display options for the stint plan, always visible above the table: which columns to show and
 * which timezone the times are in. Chips are real checkboxes and radios, so they work with the
 * keyboard and screen readers; the choice is saved in this browser.
 */
import {
  STINT_COLUMNS,
  type StintColumn,
  type StintDisplay,
  type ZoneOption,
} from '../lib/stintDisplay';

const chip =
  'cursor-pointer rounded-full border px-2.5 py-1 text-xs select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-strong';
const on = 'border-accent-strong bg-accent/20 text-text';
const off = 'border-border text-text-muted hover:text-text';
const heading = 'mr-1 text-xs font-medium text-text-muted';

export function DisplayBar({
  display,
  onChange,
  zones,
  zone,
  abbreviation,
}: {
  display: StintDisplay;
  onChange: (next: StintDisplay) => void;
  zones: ZoneOption[];
  /** The zone currently in effect (the saved choice, or the viewer's own). */
  zone: string;
  /** Short name of a zone at race start, e.g. "CDT". */
  abbreviation: (zone: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised/50 px-3 py-2.5">
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className={`${heading} float-left`}>Columns</legend>
        {(Object.keys(STINT_COLUMNS) as StintColumn[]).map((c) => (
          <label key={c} className={`${chip} ${display.columns[c] ? on : off}`}>
            <input
              type="checkbox"
              className="sr-only"
              checked={display.columns[c]}
              onChange={(e) =>
                onChange({ ...display, columns: { ...display.columns, [c]: e.target.checked } })
              }
            />
            <span aria-hidden>{display.columns[c] ? '✓ ' : ''}</span>
            {STINT_COLUMNS[c]}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className={`${heading} float-left`}>Times in</legend>
        {zones.map((z) => (
          <label key={z.zone} className={`${chip} ${zone === z.zone ? on : off}`} title={z.zone}>
            <input
              type="radio"
              name="stint-zone"
              className="sr-only"
              checked={zone === z.zone}
              onChange={() => onChange({ ...display, zone: z.zone })}
            />
            <span aria-hidden>{zone === z.zone ? '● ' : ''}</span>
            {z.who}
            <span className="text-text-muted"> · {abbreviation(z.zone)}</span>
            <span className="sr-only"> ({z.zone})</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
