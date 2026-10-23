import type { GroupUpdate, QueueUpdate, SyncCommand, SyncPlayGroup } from './syncplayProtocol';
import { readJson, writeString } from '@/lib/storage';

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
/**
 * The tab that plays along writes its claim again this often. A tab can be closed without a word
 * (a phone often drops a tab without "pagehide"); a claim that hasn't been renewed for
 * `TAB_CLAIM_STALE` is then taken as gone, instead of keeping every other tab out.
 */
export const TAB_CLAIM_EVERY = 30_000;
export const TAB_CLAIM_STALE = 3 * TAB_CLAIM_EVERY;

export function playingTab(now = Date.now()): string | null {
  const claim = readJson(PLAYING_TAB_KEY) as { id?: unknown; at?: unknown } | null | undefined;
  if (!claim || typeof claim.id !== 'string' || typeof claim.at !== 'number') return null;
  return Math.abs(now - claim.at) < TAB_CLAIM_STALE ? claim.id : null;
}

export function setPlayingTab(id: string | null, now = Date.now()) {
  writeString(PLAYING_TAB_KEY, id ? JSON.stringify({ id, at: now }) : null);
}
