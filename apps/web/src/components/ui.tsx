/** Small shared building blocks so pages look consistent. */
import type { ReactNode } from 'react';
import { linkClick } from '../lib/router';

export const button = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm hover:border-text-muted disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-md border border-unavailable/50 px-3 py-1.5 text-sm text-unavailable hover:bg-unavailable/10 disabled:cursor-not-allowed disabled:opacity-50',
  dangerSolid:
    'inline-flex items-center justify-center gap-2 rounded-md bg-danger px-3.5 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50',
  link: 'text-accent-strong underline decoration-accent-strong/50 underline-offset-2 hover:decoration-accent-strong disabled:opacity-50',
};

export const input =
  'rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted';

export function Card({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-2.5 text-base font-semibold">
            <span className="h-4 w-1.5 -skew-x-[20deg] bg-accent" aria-hidden />
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function AppLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={to} onClick={linkClick} className={className}>
      {children}
    </a>
  );
}

/** Error text with an icon, so it doesn't rely on color alone. */
export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <p role="alert" className="text-sm text-unavailable">
      <span aria-hidden>⚠ </span>
      {message}
    </p>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

export function RoleBadge({ role }: { role: 'owner' | 'admin' | 'member' }) {
  if (role === 'member') return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        role === 'owner' ? 'bg-blush text-bg' : 'border border-accent-strong/60 text-accent-strong'
      }`}
    >
      {role === 'owner' ? '★ Owner' : 'Admin'}
    </span>
  );
}
