/** Options for "Fill to the flag": how the suggested lineup picks drivers. */
import { FILL_DEFAULTS, type FillOptions } from '@le-uma/shared';
import { Popover } from './Popover';
import { button, input } from './ui';

const row = 'flex items-center justify-between gap-3';

export function FillMenu({
  options,
  onChange,
}: {
  options: FillOptions;
  onChange: (next: FillOptions) => void;
}) {
  const set = (patch: Partial<FillOptions>) => onChange({ ...options, ...patch });
  return (
    <Popover
      panelId="stint-fill-panel"
      label={
        <>
          <span aria-hidden>⚙</span> Fill options
        </>
      }
    >
      <p className="text-xs text-text-muted">
        Fill adds stints after the ones already in the plan, picking drivers who are available,
        rested and behind on driving time.
      </p>
      <label className={row}>
        Stints in a row
        <select
          value={options.stintsInARow}
          onChange={(e) => set({ stintsInARow: Number(e.target.value) })}
          className={`${input} py-1`}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1 (single)' : n === 2 ? '2 (double)' : n === 3 ? '3 (triple)' : n}
            </option>
          ))}
        </select>
      </label>
      <label className={row}>
        Rest between runs
        <select
          value={options.minRestStints}
          onChange={(e) => set({ minRestStints: Number(e.target.value) })}
          className={`${input} py-1`}
        >
          {[0, 1, 2, 3, 4, 6].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'None' : `${n} stint${n === 1 ? '' : 's'}`}
            </option>
          ))}
        </select>
      </label>
      <label className={row}>
        Marked maybe
        <select
          value={options.maybe}
          onChange={(e) => set({ maybe: e.target.value as FillOptions['maybe'] })}
          className={`${input} py-1`}
        >
          <option value="avoid">Use if needed</option>
          <option value="never">Last resort only</option>
        </select>
      </label>
      <label className={row}>
        No answer
        <select
          value={options.noAnswer}
          onChange={(e) => set({ noAnswer: e.target.value as FillOptions['noAnswer'] })}
          className={`${input} py-1`}
        >
          <option value="avoid">Use if needed</option>
          <option value="never">Last resort only</option>
        </select>
      </label>
      <label className={row}>
        Driving time
        <select
          value={options.balance}
          onChange={(e) => set({ balance: e.target.value as FillOptions['balance'] })}
          className={`${input} py-1`}
        >
          <option value="equal">Share equally</option>
          <option value="faster">Faster drive more</option>
        </select>
      </label>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-text-muted">Saved in this browser.</span>
        <button type="button" className={button.link} onClick={() => onChange(FILL_DEFAULTS)}>
          Reset
        </button>
      </div>
    </Popover>
  );
}
