import { useEffect } from 'react';

const APP = 'Le Uma Race Planner';

/** Sets the browser tab title (also announced by screen readers on navigation). */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP}` : APP;
  }, [title]);
}
