import type { GroupUpdate, QueueUpdate, SyncCommand, SyncPlayGroup } from './syncplayProtocol';

/** Remembers the group across a page reload (the server keeps the membership, the page does not). */
const GROUP_KEY = 'jellyfied.syncPlayGroup';

export function storedGroup(): string | null {
  try {
    return sessionStorage.getItem(GROUP_KEY);
  } catch {
    return null;
  }
}

export function storeGroup(id: string | null) {
  try {
    if (id) sessionStorage.setItem(GROUP_KEY, id);
    else sessionStorage.removeItem(GROUP_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The tabs of one browser are one member of the group. Jellyfin ties the live connection to the
 * sign-in's device, so they share a session, and the server sends that session's messages to only
 * one of its connections, whichever was active last. Each tab passes what it gets on to the others.
 * Only one of them plays along: the one where SyncPlay was last used.
 */
export type TabMessage =
  | { kind: 'update'; data: GroupUpdate }
  | { kind: 'command'; data: SyncCommand }
  | { kind: 'hello' }
  | { kind: 'state'; group: SyncPlayGroup; queue: QueueUpdate | null };

const PLAYING_TAB_KEY = 'jellyfied.syncPlayTab';

export function playingTab(): string | null {
  try {
    return localStorage.getItem(PLAYING_TAB_KEY);
  } catch {
    return null;
  }
}

export function setPlayingTab(id: string | null) {
  try {
    if (id) localStorage.setItem(PLAYING_TAB_KEY, id);
    else localStorage.removeItem(PLAYING_TAB_KEY);
  } catch {
    /* ignore */
  }
}
