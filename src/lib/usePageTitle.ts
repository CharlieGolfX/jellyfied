import { useEffect } from 'react';
import { APP_NAME } from '@/config';

/** "Dune · Jellyplex" for a page, plain "Jellyplex" without one. */
export function pageTitle(title?: string | null): string {
  const t = title?.trim();
  return t ? `${t} · ${APP_NAME}` : APP_NAME;
}

/**
 * Names the browser tab and history entry after the current page. Without a title (data still
 * loading, or a part of the screen that only sometimes owns the title) the tab is left alone.
 */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    if (!title?.trim()) return;
    const mine = pageTitle(title);
    document.title = mine;
    return () => {
      // Back to the plain name, unless another page has already put its own title up.
      if (document.title === mine) document.title = APP_NAME;
    };
  }, [title]);
}
