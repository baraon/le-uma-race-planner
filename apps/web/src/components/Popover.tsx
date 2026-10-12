/**
 * A button that opens a small panel below it (a disclosure). Closes on Esc (focus returns to the
 * button), on a click outside, or on the button again.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { button } from './ui';

export function Popover({
  label,
  panelId,
  children,
}: {
  /** Button content. */
  label: ReactNode;
  /** Optional fixed id for the panel (otherwise generated). */
  panelId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const generated = useId();
  const id = panelId ?? generated;

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

  return (
    <div ref={wrap} className="relative">
      <button
        ref={toggle}
        type="button"
        className={button.secondary}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div
          id={id}
          className="absolute right-0 z-30 mt-2 flex w-72 flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4 text-sm shadow-2xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}
