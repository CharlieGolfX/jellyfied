import type { BaseItemDto } from '@/api/types';
import { dayOf, oldestKept, parseDay, type Playtime } from './playtime';

/**
 * Viewing and listening statistics from the time Jellyfied measured playing (see playtime.ts),
 * for one of the periods the stats page offers. Only what was actually played counts: marking
 * something as watched adds nothing.
 */

export const RANGES = ['7d', '30d', '3m', '6m', '12m'] as const;
export type Range = (typeof RANGES)[number];

/** The first day of a period that ends today. */
export function rangeStart(range: Range, now = new Date()): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (range) {
    case '7d':
      return new Date(y, m, d - 6);
    case '30d':
      return new Date(y, m, d - 29);
    case '3m':
      return new Date(y, m - 3, d + 1);
    case '6m':
      return new Date(y, m - 6, d + 1);
    case '12m':
      return parseDay(oldestKept(now));
  }
}

export interface Bucket {
  start: Date;
  seconds: number;
}

export interface WatchStats {
  /** Seconds of video played. */
  seconds: number;
  /** Seconds of music played. */
  musicSeconds: number;
  /** Films and episodes played through at least once. */
  films: number;
  episodes: number;
  /** Shows with at least one episode played through. */
  shows: number;
  /** Songs played through, every play counted. */
  songPlays: number;
  /** Genres by seconds of video played, most first. */
  genres: { name: string; seconds: number }[];
  /** Films played through more than once, most first. */
  rewatched: { item: BaseItemDto; plays: number }[];
  /** Time played, by day (7 and 30 days), week (3 and 6 months) or month (12 months), oldest first. */
  buckets: Bucket[];
  bucket: 'day' | 'week' | 'month';
  /** When measuring started, if anything was measured. */
  since: Date | null;
}

/** Monday 00:00 of the week `date` falls in, in local time. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function buckets(range: Range, first: Date, now: Date): { unit: WatchStats['bucket']; list: Bucket[]; index: (day: Date) => number } {
  if (range === '7d' || range === '30d') {
    const count = range === '7d' ? 7 : 30;
    const list = Array.from({ length: count }, (_, i) => ({
      start: new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
      seconds: 0,
    }));
    return { unit: 'day', list, index: (day) => Math.round((day.getTime() - first.getTime()) / 86_400_000) };
  }
  if (range === '12m') {
    const list = Array.from({ length: 13 }, (_, i) => ({
      start: new Date(first.getFullYear(), first.getMonth() + i, 1),
      seconds: 0,
    })).filter((b) => b.start <= now);
    return { unit: 'month', list, index: (day) => (day.getFullYear() - first.getFullYear()) * 12 + day.getMonth() - first.getMonth() };
  }
  const firstWeek = weekStart(first);
  const count = Math.round((weekStart(now).getTime() - firstWeek.getTime()) / (7 * 86_400_000)) + 1;
  const list = Array.from({ length: count }, (_, i) => ({
    start: new Date(firstWeek.getFullYear(), firstWeek.getMonth(), firstWeek.getDate() + 7 * i),
    seconds: 0,
  }));
  return { unit: 'week', list, index: (day) => Math.round((weekStart(day).getTime() - firstWeek.getTime()) / (7 * 86_400_000)) };
}

/**
 * `items` are the played videos' details (type, genres, show), looked up by id; `seriesGenres`
 * the genres of the shows the episodes belong to (episodes rarely have their own).
 */
export function watchStats(
  playtime: Playtime,
  items: Map<string, BaseItemDto>,
  seriesGenres: Map<string, string[]>,
  range: Range,
  now = new Date(),
): WatchStats {
  const first = rangeStart(range, now);
  const from = dayOf(first);
  const to = dayOf(now);
  const chart = buckets(range, first, now);

  let seconds = 0;
  let musicSeconds = 0;
  let songPlays = 0;
  const perItem = new Map<string, DayTotals>();
  for (const [day, t] of Object.entries(playtime.days)) {
    if (day < from || day > to) continue;
    seconds += t.v;
    musicSeconds += t.a;
    songPlays += t.ap ?? 0;
    const i = chart.index(parseDay(day));
    if (i >= 0 && i < chart.list.length) chart.list[i].seconds += t.v + t.a;
    for (const [id, [s, n]] of Object.entries(t.i ?? {})) {
      const total = perItem.get(id) ?? { s: 0, n: 0 };
      total.s += s;
      total.n += n;
      perItem.set(id, total);
    }
  }

  const genres = new Map<string, number>();
  const shows = new Set<string>();
  let films = 0;
  let episodes = 0;
  const rewatched: WatchStats['rewatched'] = [];
  for (const [id, played] of perItem) {
    const item = items.get(id);
    if (!item) continue;
    if (played.n > 0 && item.Type === 'Movie') films++;
    if (played.n > 0 && item.Type === 'Episode') {
      episodes++;
      if (item.SeriesId) shows.add(item.SeriesId);
    }
    if (played.n > 1 && item.Type === 'Movie') rewatched.push({ item, plays: played.n });
    const names = item.Genres?.length ? item.Genres : item.SeriesId ? (seriesGenres.get(item.SeriesId) ?? []) : [];
    for (const name of names) genres.set(name, (genres.get(name) ?? 0) + played.s);
  }

  return {
    seconds,
    musicSeconds,
    films,
    episodes,
    shows: shows.size,
    songPlays,
    genres: [...genres].map(([name, s]) => ({ name, seconds: s })).sort((a, b) => b.seconds - a.seconds),
    rewatched: rewatched.sort((a, b) => b.plays - a.plays),
    buckets: chart.list,
    bucket: chart.unit,
    since: playtime.since ? parseDay(playtime.since) : null,
  };
}

interface DayTotals {
  s: number;
  n: number;
}

/** What a user shares for comparisons, per period: totals and time per genre, nothing about titles. */
export interface StatsSummary {
  video: number;
  music: number;
  films: number;
  episodes: number;
  songs: number;
  /** Seconds per genre, the 25 largest. */
  genres: Record<string, number>;
}

export function summarize(stats: WatchStats): StatsSummary {
  return {
    video: Math.round(stats.seconds),
    music: Math.round(stats.musicSeconds),
    films: stats.films,
    episodes: stats.episodes,
    songs: stats.songPlays,
    genres: Object.fromEntries(stats.genres.slice(0, 25).map((g) => [g.name, Math.round(g.seconds)])),
  };
}
