import type { BaseItemDto } from '@/api/types';
import { ticksToSeconds } from './format';

/**
 * Viewing statistics from what Jellyfin keeps per item: whether it was played, how often and when
 * last. Jellyfin has no history of single plays, so a rewatch counts the whole run time again and
 * an item counts in the week it was last played.
 */
export interface WatchStats {
  /** Seconds of films and episodes watched, rewatches included. */
  seconds: number;
  films: number;
  episodes: number;
  /** Shows with at least one watched episode. */
  shows: number;
  /** Songs played, every play counted. */
  songPlays: number;
  /** Genres by seconds watched, most first. */
  genres: { name: string; seconds: number }[];
  /** Films watched more than once, most first. */
  rewatched: { item: BaseItemDto; plays: number }[];
  /** The last `weeks` weeks, oldest first: films and episodes last watched in each. */
  weeks: { start: Date; count: number }[];
}

const plays = (item: BaseItemDto) => Math.max(1, item.UserData?.PlayCount ?? 1);

/** Monday 00:00 of the week `date` falls in, in local time. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * `watched` are the played films and episodes; `seriesGenres` the genres of the shows the episodes
 * belong to (episodes rarely have their own); `songs` the played songs.
 */
export function watchStats(
  watched: BaseItemDto[],
  seriesGenres: Map<string, string[]>,
  songs: BaseItemDto[],
  now = new Date(),
  weeks = 12,
): WatchStats {
  let seconds = 0;
  const genres = new Map<string, number>();
  const shows = new Set<string>();
  for (const item of watched) {
    const time = ticksToSeconds(item.RunTimeTicks) * plays(item);
    seconds += time;
    if (item.SeriesId) shows.add(item.SeriesId);
    const names = item.Genres?.length ? item.Genres : item.SeriesId ? (seriesGenres.get(item.SeriesId) ?? []) : [];
    for (const name of names) genres.set(name, (genres.get(name) ?? 0) + time);
  }

  const first = weekStart(now);
  first.setDate(first.getDate() - 7 * (weeks - 1));
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(first);
    start.setDate(first.getDate() + 7 * i);
    return { start, count: 0 };
  });
  for (const item of watched) {
    const last = item.UserData?.LastPlayedDate;
    if (!last) continue;
    const i = Math.floor((weekStart(new Date(last)).getTime() - first.getTime()) / (7 * 86_400_000) + 0.5);
    if (i >= 0 && i < weeks) buckets[i].count++;
  }

  return {
    seconds,
    films: watched.filter((i) => i.Type === 'Movie').length,
    episodes: watched.filter((i) => i.Type === 'Episode').length,
    shows: shows.size,
    songPlays: songs.reduce((n, s) => n + plays(s), 0),
    genres: [...genres].map(([name, s]) => ({ name, seconds: s })).sort((a, b) => b.seconds - a.seconds),
    rewatched: watched
      .filter((i) => i.Type === 'Movie' && plays(i) > 1)
      .map((item) => ({ item, plays: plays(item) }))
      .sort((a, b) => b.plays - a.plays),
    weeks: buckets,
  };
}
