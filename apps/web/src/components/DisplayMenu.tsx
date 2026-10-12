/**
 * "Display" pop-over for the stint plan: column checkboxes and a timezone choice. A disclosure
 * (button + panel), closed by Esc, an outside click, or the button; focus returns to the button.
 */
import { useEffect, useRef, useState } from 'react';
import {
  STINT_COLUMNS,
  type StintColumn,
  type StintDisplay,
  type ZoneOption,
} from '../lib/stintDisplay';
import { button } from './ui';

export function DisplayMenu({
  display,
  onChange,
  zones,
}: {
  display: StintDisplay;
  onChange: (next: StintDisplay) => void;
  zones: ZoneOption[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const zoneChoice = zones.some((z) => z.choice === display.zone) ? display.zone : zones[0]?.choice;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={toggle}
        type="button"
        className={button.secondary}
        aria-expanded={open}
        aria-controls="stint-display-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>👁</span> Display
      </button>
      {open && (
        <div
          id="stint-display-panel"
          className="absolute right-0 z-30 mt-2 flex w-72 flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4 text-sm shadow-2xl"
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-text-muted uppercase">
              Columns
            </legend>
            {(Object.keys(STINT_COLUMNS) as StintColumn[]).map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={display.columns[c]}
                  onChange={(e) =>
                    onChange({ ...display, columns: { ...display.columns, [c]: e.target.checked } })
                  }
                />
                {STINT_COLUMNS[c]}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1.5 border-t border-border pt-3">
            <legend className="mb-1 pt-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
              Timezone
            </legend>
            {zones.map((z) => (
              <label key={z.choice} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="stint-zone"
                  className="mt-1"
                  checked={zoneChoice === z.choice}
                  onChange={() => onChange({ ...display, zone: z.choice })}
                />
                <span>{z.label}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-text-muted">Saved in this browser.</p>
        </div>
      )}
    </div>
  );
}
