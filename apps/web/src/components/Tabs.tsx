/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys / Home / End move between tabs, the open
 * tab is kept in the URL hash so links and reloads return to it, and every panel stays mounted
 * (inactive ones are hidden) so unsaved work in one tab survives switching to another.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface Tab {
  /** Also the URL hash, e.g. "strategy" → #strategy. */
  id: string;
  label: ReactNode;
  panel: ReactNode;
}

function tabFromHash(tabs: Tab[]): string {
  const hash = window.location.hash.slice(1);
  return tabs.some((t) => t.id === hash) ? hash : tabs[0]!.id;
}

export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [active, setActive] = useState(() => tabFromHash(tabs));
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const base = useId();

  // Back/forward between hash changes switches tabs too.
  useEffect(() => {
    const onHash = () => setActive(tabFromHash(tabs));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [tabs]);

  const open = (id: string, focus = false) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.hash = id === tabs[0]!.id ? '' : id;
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (focus) refs.current.get(id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    open(tabs[to]!.id, true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) refs.current.set(t.id, el);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(t.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
                selected
                  ? 'border-accent-strong text-text'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          className="flex flex-col gap-8"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
