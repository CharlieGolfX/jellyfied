import { useSyncExternalStore } from 'react';
import type { JellyfinApi } from '@/api/client';

/** Another device that playback is being sent to ("Play on"), instead of playing in this browser. */
export interface CastTarget {
  sessionId: string;
  deviceName: string;
  client: string;
  userName: string;
}

const KEY = 'jellyplex.castTarget';

function read(): CastTarget | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CastTarget) : null;
    return parsed?.sessionId ? parsed : null;
  } catch {
    return null;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function setCastTarget(target: CastTarget | null) {
  current = target;
  try {
    if (target) sessionStorage.setItem(KEY, JSON.stringify(target));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getCastTarget(): CastTarget | null {
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCastTarget(): CastTarget | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export type RemotePlayCommand = 'PlayNow' | 'PlayNext' | 'PlayLast' | 'PlayShuffle';

/** Tells another device to play the given items. */
export function sendRemotePlay(
  api: JellyfinApi,
  target: CastTarget,
  itemIds: string[],
  opts: { command?: RemotePlayCommand; startIndex?: number; startPositionTicks?: number } = {},
) {
  // Ids travel in the query string, so keep the list to a sensible length.
  const start = opts.startIndex ?? 0;
  const ids = itemIds.length > 100 ? itemIds.slice(start, start + 100) : itemIds;
  return api.post(`/Sessions/${target.sessionId}/Playing`, undefined, {
    playCommand: opts.command ?? 'PlayNow',
    itemIds: ids,
    startIndex: itemIds.length > 100 ? 0 : start,
    startPositionTicks: opts.startPositionTicks,
  });
}
