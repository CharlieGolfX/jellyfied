import { useSyncExternalStore } from 'react';

/** How library pages lay their items out. Stored in this browser only. */
export type LibraryView = 'grid' | 'list';

const KEY = 'jellyfied.libraryView';

function read(): LibraryView {
  try {
    return localStorage.getItem(KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

let current = read();
const listeners = new Set<() => void>();

export function setLibraryView(view: LibraryView) {
  current = view;
  try {
    localStorage.setItem(KEY, view);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLibraryView(): [LibraryView, (view: LibraryView) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'grid' as LibraryView,
  );
  return [value, setLibraryView];
}
