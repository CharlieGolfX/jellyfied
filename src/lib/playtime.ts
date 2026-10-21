import type { JellyfinApi } from '@/api/client';

/**
 * How long this account has actually played things, measured by Jellyfied's own players while
 * they play. Marking something as watched doesn't count, since nothing was played. Jellyfin keeps
 * no such record, so it is stored with the account in its "display preferences" (like the synced
 * settings), where every browser the account uses adds to the same totals.
 *
 * It is kept per day for the last twelve months (365 days, or 366 across a 29 February), so the
 * stats can show any part of that year: per day, the seconds of video and music, the songs played
 * through, and for video each title with its seconds and how often it was played through.
 *
 * What is played is collected in local storage (so a closed tab loses nothing) and merged into the
 * account's copy now and then, one browser tab at a time.
 */

export type MediaKind = 'video' | 'audio';

/** A video played on a day: [seconds played, times played through]. */
export type DayItem = [number, number];

export interface PlaytimeDay {
  /** Seconds of video. */
  v: number;
  /** Seconds of music. */
  a: number;
  /** Songs played through. */
  ap?: number;
  /** Videos, by id. */
  i?: Record<string, DayItem>;
}

export interface Playtime {
  version: 2;
  /** Local date (YYYY-MM-DD) to what was played that day. */
  days: Record<string, PlaytimeDay>;
  /** When measuring started (YYYY-MM-DD). */
  since?: string;
}

const PREFS_ID = 'jellyfied-playtime';
const CLIENT = 'jellyfied';
const FIELD = 'playtime';
const pendingKey = (userId: string) => `jellyfied.playtime.pending.${userId}`;

export const emptyPlaytime = (): Playtime => ({ version: 2, days: {} });

const pad = (n: number) => String(n).padStart(2, '0');

/** A local date as YYYY-MM-DD. */
export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A YYYY-MM-DD local date as a Date at its midnight. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The first day that is still kept: the day after the same date a year ago. */
export function oldestKept(now = new Date()): string {
  const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1);
  return dayOf(d);
}

/** Drops the days more than a year old. Changes and returns `playtime`. */
export function prunePlaytime(playtime: Playtime, now = new Date()): Playtime {
  const keep = oldestKept(now);
  for (const day of Object.keys(playtime.days)) if (day < keep) delete playtime.days[day];
  if (playtime.since && playtime.since < keep) playtime.since = keep;
  return playtime;
}

/** Adds `extra` into `base`, which is changed and returned. */
export function mergePlaytime(base: Playtime, extra: Playtime): Playtime {
  for (const [day, t] of Object.entries(extra.days)) {
    const d = (base.days[day] ??= { v: 0, a: 0 });
    d.v += t.v;
    d.a += t.a;
    if (t.ap) d.ap = (d.ap ?? 0) + t.ap;
    for (const [id, [s, n]] of Object.entries(t.i ?? {})) {
      const items = (d.i ??= {});
      const item = (items[id] ??= [0, 0]);
      item[0] += s;
      item[1] += n;
    }
  }
  if (extra.since && (!base.since || extra.since < base.since)) base.since = extra.since;
  return base;
}

/** What the first version stored (totals per title, without days) in the current form. */
function upgrade(raw: unknown): Playtime {
  const old = raw as {
    version?: number;
    days?: Record<string, { v: number; a: number }>;
    items?: Record<string, { s: number; n: number; k: MediaKind }>;
    since?: string;
  } | null;
  if (!old || typeof old !== 'object' || !old.days) return emptyPlaytime();
  if (old.version === 2) return old as Playtime;
  // Measuring only began with that version, a day or so before this one: its titles go on its first day.
  const playtime: Playtime = { version: 2, days: {}, since: old.since };
  for (const [day, t] of Object.entries(old.days)) playtime.days[day] = { v: t.v, a: t.a };
  const first = old.since ?? Object.keys(old.days).sort()[0] ?? dayOf(new Date());
  const d = (playtime.days[first] ??= { v: 0, a: 0 });
  for (const [id, item] of Object.entries(old.items ?? {})) {
    if (item.k === 'audio') d.ap = (d.ap ?? 0) + item.n;
    else (d.i ??= {})[id] = [item.s, item.n];
  }
  return playtime;
}

function readPending(userId: string): Playtime {
  try {
    return upgrade(JSON.parse(localStorage.getItem(pendingKey(userId)) ?? 'null'));
  } catch {
    return emptyPlaytime();
  }
}

function writePending(userId: string, pending: Playtime) {
  try {
    if (Object.keys(pending.days).length) localStorage.setItem(pendingKey(userId), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey(userId));
  } catch {
    /* storage unavailable: it stays in memory until the next flush */
  }
}

/** Adds seconds played of a title, today. */
export function recordPlaytime(userId: string, itemId: string, kind: MediaKind, seconds: number, now = new Date()) {
  if (!(seconds > 0)) return;
  const day: PlaytimeDay = kind === 'video' ? { v: seconds, a: 0, i: { [itemId]: [seconds, 0] } } : { v: 0, a: seconds };
  const pending = readPending(userId);
  mergePlaytime(pending, { version: 2, days: { [dayOf(now)]: day }, since: dayOf(now) });
  writePending(userId, pending);
}

/** Counts a title as played through once, today. */
export function recordPlayedThrough(userId: string, itemId: string, kind: MediaKind, now = new Date()) {
  const day: PlaytimeDay = kind === 'video' ? { v: 0, a: 0, i: { [itemId]: [0, 1] } } : { v: 0, a: 0, ap: 1 };
  const pending = readPending(userId);
  mergePlaytime(pending, { version: 2, days: { [dayOf(now)]: day } });
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
    playtime = upgrade(JSON.parse(dto.CustomPrefs?.[FIELD] ?? 'null'));
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

/** Takes what was saved out of what is pending, leaving what was played in the meantime. */
function subtract(now: Playtime, saved: Playtime) {
  for (const [day, t] of Object.entries(saved.days)) {
    const d = now.days[day];
    if (!d) continue;
    d.v -= t.v;
    d.a -= t.a;
    if (t.ap) d.ap = (d.ap ?? 0) - t.ap;
    for (const [id, [s, n]] of Object.entries(t.i ?? {})) {
      const item = d.i?.[id];
      if (!item) continue;
      item[0] -= s;
      item[1] -= n;
      if (item[0] <= 0.01 && item[1] <= 0) delete d.i![id];
    }
    if (d.i && !Object.keys(d.i).length) delete d.i;
    if (!d.ap) delete d.ap;
    if (d.v <= 0.01 && d.a <= 0.01 && !d.ap && !d.i) delete now.days[day];
  }
  delete now.since;
}

/**
 * Adds what this browser has played since last time to the account's copy (dropping what is now
 * more than a year old), and returns the account's totals. What could not be saved is kept for
 * the next time. `extra` are other settings kept in the same place, such as taking part in
 * comparisons, written along.
 */
export function syncPlaytime(api: JellyfinApi, userId: string, extra?: Record<string, string | null>): Promise<Playtime> {
  return exclusively(async () => {
    const pending = readPending(userId);
    const { dto, playtime } = await readServer(api, userId);
    const before = JSON.stringify(playtime);
    const merged = prunePlaytime(mergePlaytime(playtime, pending));
    const changedSettings = extra && Object.entries(extra).some(([k, v]) => (dto.CustomPrefs?.[k] ?? null) !== v);
    if (JSON.stringify(merged) !== before || changedSettings) {
      await api.post(
        `/DisplayPreferences/${PREFS_ID}`,
        { ...dto, CustomPrefs: { ...dto.CustomPrefs, ...extra, [FIELD]: JSON.stringify(merged) } },
        { userId, client: CLIENT },
      );
    }
    const now = readPending(userId);
    subtract(now, pending);
    writePending(userId, now);
    return merged;
  });
}

/** A setting kept with the playtime (see syncPlaytime's `extra`). */
export async function readPlaytimeSetting(api: JellyfinApi, userId: string, key: string): Promise<string | null> {
  return (await readServer(api, userId)).dto.CustomPrefs?.[key] ?? null;
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
