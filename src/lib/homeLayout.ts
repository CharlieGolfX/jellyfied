import { useSyncExternalStore } from 'react';
import { onPrefPulled, prefChanged } from './prefsBus';

/**
 * Which rows the home page shows and in what order. Synced with the account (see prefsSync).
 * Rows are named 'continue', 'listening' and 'latest:<library id>'.
 */
export interface HomeLayout {
  /** Rows the user has put in order; rows not listed keep their usual place after these. */
  order: string[];
  hidden: string[];
  /** The large featured title at the top. */
  banner: boolean;
}

export const DEFAULT_HOME_LAYOUT: HomeLayout = { order: [], hidden: [], banner: true };

const KEY = 'jellyplex.home';

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function parseHomeLayout(raw: string | null): HomeLayout {
  try {
    const parsed = JSON.parse(raw ?? '{}') as Partial<HomeLayout> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_HOME_LAYOUT;
    return { order: strings(parsed.order), hidden: strings(parsed.hidden), banner: parsed.banner !== false };
  } catch {
    return DEFAULT_HOME_LAYOUT;
  }
}

/** The rows that exist right now, in the user's order, each marked shown or hidden. */
export function arrangeRows(available: string[], layout: HomeLayout): { id: string; hidden: boolean }[] {
  const known = new Set(available);
  const placed = layout.order.filter((id) => known.has(id));
  const rest = available.filter((id) => !placed.includes(id));
  return [...placed, ...rest].map((id) => ({ id, hidden: layout.hidden.includes(id) }));
}

/** The order after moving one row up (-1) or down (+1) among the rows that exist. */
export function moveRow(ids: string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function read(): HomeLayout {
  try {
    return parseHomeLayout(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_HOME_LAYOUT;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function setHomeLayout(patch: Partial<HomeLayout>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
  prefChanged(KEY);
}

onPrefPulled(KEY, () => {
  current = read();
  listeners.forEach((l) => l());
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useHomeLayout(): [HomeLayout, (patch: Partial<HomeLayout>) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_HOME_LAYOUT,
  );
  return [value, setHomeLayout];
}
