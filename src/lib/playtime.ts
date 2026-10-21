import type { JellyfinApi } from '@/api/client';

/**
 * How long this account has actually played things, measured by Jellyfied's own players while
 * they play: seconds per day and per title, and how often a title was played through. Marking
 * something as watched doesn't count, since nothing was played. Jellyfin keeps no such record, so
 * it is stored with the account in its "display preferences" (like the synced settings), where
 * every browser the account uses adds to the same totals.
 *
 * What is played is collected here and in local storage (so a closed tab loses nothing), and
 * merged into the account's copy now and then, one browser tab at a time.
 */

export type MediaKind = 'video' | 'audio';

export interface PlaytimeItem {
  /** Seconds played. */
  s: number;
  /** Times played through (see PLAYED_THROUGH). */
  n: number;
  k: MediaKind;
}

export interface Playtime {
  /** Local date (YYYY-MM-DD) to seconds of video and of audio played that day. */
  days: Record<string, { v: number; a: number }>;
  items: Record<string, PlaytimeItem>;
  /** When recording started (ISO date). */
  since?: string;
}

const PREFS_ID = 'jellyfied-playtime';
const CLIENT = 'jellyfied';
const FIELD = 'playtime';
const pendingKey = (userId: string) => `jellyfied.playtime.pending.${userId}`;

export const emptyPlaytime = (): Playtime => ({ days: {}, items: {} });

/** A local date as YYYY-MM-DD. */
export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Adds `extra` into `base`, which is changed and returned. */
export function mergePlaytime(base: Playtime, extra: Playtime): Playtime {
  for (const [day, t] of Object.entries(extra.days)) {
    const d = (base.days[day] ??= { v: 0, a: 0 });
    d.v += t.v;
    d.a += t.a;
  }
  for (const [id, t] of Object.entries(extra.items)) {
    const i = (base.items[id] ??= { s: 0, n: 0, k: t.k });
    i.s += t.s;
    i.n += t.n;
  }
  if (extra.since && (!base.since || extra.since < base.since)) base.since = extra.since;
  return base;
}

function readPending(userId: string): Playtime {
  try {
    const raw = JSON.parse(localStorage.getItem(pendingKey(userId)) ?? 'null') as Playtime | null;
    return raw && raw.days && raw.items ? raw : emptyPlaytime();
  } catch {
    return emptyPlaytime();
  }
}

function writePending(userId: string, pending: Playtime) {
  try {
    if (Object.keys(pending.items).length) localStorage.setItem(pendingKey(userId), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey(userId));
  } catch {
    /* storage unavailable: it stays in memory until the next flush */
  }
}

/** Adds seconds played of a title, today. */
export function recordPlaytime(userId: string, itemId: string, kind: MediaKind, seconds: number, now = new Date()) {
  if (!(seconds > 0)) return;
  const pending = readPending(userId);
  mergePlaytime(pending, {
    days: { [dayOf(now)]: kind === 'video' ? { v: seconds, a: 0 } : { v: 0, a: seconds } },
    items: { [itemId]: { s: seconds, n: 0, k: kind } },
    since: dayOf(now),
  });
  writePending(userId, pending);
}

/** Counts a title as played through once. */
export function recordPlayedThrough(userId: string, itemId: string, kind: MediaKind) {
  const pending = readPending(userId);
  mergePlaytime(pending, { days: {}, items: { [itemId]: { s: 0, n: 1, k: kind } } });
  writePending(userId, pending);
}

interface DisplayPreferences {
  CustomPrefs?: Record<string, string | null> | null;
  [key: string]: unknown;
}

async function readServer(api: JellyfinApi, userId: string): Promise<{ dto: DisplayPreferences; playtime: Playtime }> {
  const dto = await api.get<DisplayPreferences>(`/DisplayPreferences/${PREFS_ID}`, { userId, client: CLIENT });
  let playtime = emptyPlaytime();
  try {
    const parsed = JSON.parse(dto.CustomPrefs?.[FIELD] ?? 'null') as Playtime | null;
    if (parsed && parsed.days && parsed.items) playtime = parsed;
  } catch {
    /* unreadable: start over */
  }
  return { dto, playtime };
}

/** Within one browser, one tab at a time adds its share to the account's copy. */
function exclusively<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? (locks.request('jellyfied-playtime', work) as Promise<T>) : work();
}

/**
 * Adds what this browser has played since last time to the account's copy, and returns the
 * account's totals. What could not be saved is kept for the next time.
 */
export function syncPlaytime(api: JellyfinApi, userId: string): Promise<Playtime> {
  return exclusively(async () => {
    const pending = readPending(userId);
    const { dto, playtime } = await readServer(api, userId);
    if (!Object.keys(pending.items).length) return playtime;
    const merged = mergePlaytime(playtime, pending);
    await api.post(
      `/DisplayPreferences/${PREFS_ID}`,
      { ...dto, CustomPrefs: { ...dto.CustomPrefs, [FIELD]: JSON.stringify(merged) } },
      { userId, client: CLIENT },
    );
    // Anything played while saving stays pending.
    const now = readPending(userId);
    for (const [day, t] of Object.entries(pending.days)) {
      const d = now.days[day];
      if (!d) continue;
      d.v -= t.v;
      d.a -= t.a;
      if (d.v <= 0.01 && d.a <= 0.01) delete now.days[day];
    }
    for (const [id, t] of Object.entries(pending.items)) {
      const i = now.items[id];
      if (!i) continue;
      i.s -= t.s;
      i.n -= t.n;
      if (i.s <= 0.01 && i.n <= 0) delete now.items[id];
    }
    if (!Object.keys(now.items).length) now.days = {};
    delete now.since;
    writePending(userId, now);
    return merged;
  });
}

/**
 * Whether a session has played enough of a title to count it as played: most of a video, and
 * half a song or four minutes of it, as music services count a play.
 */
export function playedThrough(kind: MediaKind, secondsPlayed: number, duration: number): boolean {
  if (!(duration > 0)) return false;
  if (kind === 'audio') return secondsPlayed >= Math.min(duration / 2, 240);
  return secondsPlayed >= duration * 0.8;
}
