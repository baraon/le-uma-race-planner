/**
 * Just enough client-side routing for a handful of pages: the current path, plus navigation
 * through the History API. Caddy (and Vite in dev) serve index.html for any path.
 */
import { useEffect, useSyncExternalStore, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
/** Set while a page has unsaved changes; returns false to cancel navigation. */
let guard: (() => boolean) | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** True if it's fine to throw away the current page's state (asks when there are unsaved changes). */
export function confirmDiscard(): boolean {
  return !guard || guard();
}

export function navigate(to: string, { replace = false } = {}) {
  if (!confirmDiscard()) return;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  listeners.forEach((l) => l());
}

/** onClick for <a href> links: navigate in-app on a plain left click, else let the browser. */
export function linkClick(e: MouseEvent<HTMLAnchorElement>) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(e.currentTarget.getAttribute('href') ?? '/');
}

/** Matches "/groups/:groupId" against a path; returns the params, or null if it doesn't fit. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean);
  const got = path.split('/').filter(Boolean);
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const g = got[i]!;
    if (w.startsWith(':')) params[w.slice(1)] = decodeURIComponent(g);
    else if (w !== g) return null;
  }
  return params;
}

/** While `active`, leaving the page (in-app link, reload, closing the tab) asks first. */
export function useNavigationGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const confirmLeave = () => window.confirm(message);
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    guard = confirmLeave;
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      if (guard === confirmLeave) guard = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [active, message]);
}
