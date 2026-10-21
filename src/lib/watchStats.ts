import type { BaseItemDto } from '@/api/types';
import type { Playtime } from './playtime';

/**
 * Viewing and listening statistics from the time Jellyfied measured playing (see playtime.ts).
 * Only what was actually played counts: marking something as watched adds nothing.
 */
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
  /** The last `weeks` weeks, oldest first: seconds of video and music played in each. */
  weeks: { start: Date; seconds: number }[];
  /** When measuring started, if anything was measured. */
  since: Date | null;
}

/** Monday 00:00 of the week `date` falls in, in local time. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** A YYYY-MM-DD local date as a Date at its midnight. */
const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * `items` are the played titles' details (type, genres, show), looked up by id; `seriesGenres`
 * the genres of the shows the episodes belong to (episodes rarely have their own).
 */
export function watchStats(
  playtime: Playtime,
  items: Map<string, BaseItemDto>,
  seriesGenres: Map<string, string[]>,
  now = new Date(),
  weeks = 12,
): WatchStats {
  const genres = new Map<string, number>();
  const shows = new Set<string>();
  let films = 0;
  let episodes = 0;
  let songPlays = 0;
  const rewatched: WatchStats['rewatched'] = [];
  for (const [id, played] of Object.entries(playtime.items)) {
    if (played.k === 'audio') {
      songPlays += played.n;
      continue;
    }
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

  let seconds = 0;
  let musicSeconds = 0;
  const first = weekStart(now);
  first.setDate(first.getDate() - 7 * (weeks - 1));
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(first);
    start.setDate(first.getDate() + 7 * i);
    return { start, seconds: 0 };
  });
  for (const [day, t] of Object.entries(playtime.days)) {
    seconds += t.v;
    musicSeconds += t.a;
    const i = Math.round((weekStart(parseDay(day)).getTime() - first.getTime()) / (7 * 86_400_000));
    if (i >= 0 && i < weeks) buckets[i].seconds += t.v + t.a;
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
    weeks: buckets,
    since: playtime.since ? parseDay(playtime.since) : null,
  };
}
