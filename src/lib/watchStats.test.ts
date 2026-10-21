import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@/api/types';
import type { Playtime } from './playtime';
import { rangeStart, summarize, watchStats } from './watchStats';

const item = (fields: Partial<BaseItemDto>) => ({ Type: 'Movie', ...fields }) as BaseItemDto;
const now = new Date(2026, 9, 21, 12); // a Wednesday

const playtime: Playtime = {
  version: 2,
  since: '2026-01-10',
  days: {
    '2026-10-21': { v: 3600, a: 600, ap: 2, i: { 'film-a': [3600, 1] } },
    '2026-10-15': { v: 1800, a: 0, i: { 'ep-1': [1800, 1] } },
    '2026-09-01': { v: 7200, a: 0, i: { 'film-a': [7200, 1], 'film-b': [1200, 0] } },
    '2026-01-10': { v: 5400, a: 3000, ap: 10, i: { 'film-c': [5400, 1] } },
  },
};
const items = new Map([
  ['film-a', item({ Id: 'film-a', Name: 'Film A', Genres: ['Drama'] })],
  ['film-b', item({ Id: 'film-b', Name: 'Film B', Genres: ['Comedy'] })],
  ['film-c', item({ Id: 'film-c', Name: 'Film C', Genres: ['Horror'] })],
  ['ep-1', item({ Id: 'ep-1', Type: 'Episode', SeriesId: 'show-1' })],
]);
const series = new Map([['show-1', ['Comedy']]]);

describe('watchStats', () => {
  it('starts each period on the right day', () => {
    const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
    expect(day(rangeStart('7d', now))).toEqual([2026, 10, 15]);
    expect(day(rangeStart('30d', now))).toEqual([2026, 9, 22]);
    expect(day(rangeStart('3m', now))).toEqual([2026, 7, 22]);
    expect(day(rangeStart('6m', now))).toEqual([2026, 4, 22]);
    expect(day(rangeStart('12m', now))).toEqual([2025, 10, 22]);
  });

  it('counts only what was played in the period', () => {
    const week = watchStats(playtime, items, series, '7d', now);
    expect([week.seconds, week.musicSeconds, week.films, week.episodes, week.shows, week.songPlays]).toEqual([5400, 600, 1, 1, 1, 2]);
    expect(week.genres).toEqual([
      { name: 'Drama', seconds: 3600 },
      { name: 'Comedy', seconds: 1800 },
    ]);
    expect(week.rewatched).toEqual([]);

    const year = watchStats(playtime, items, series, '12m', now);
    expect([year.seconds, year.films, year.songPlays]).toEqual([18000, 2, 12]);
    // Played through on two days: rewatched.
    expect(year.rewatched.map((r) => [r.item.Name, r.plays])).toEqual([['Film A', 2]]);
  });

  it('charts days, weeks or months to suit the period', () => {
    const week = watchStats(playtime, items, series, '7d', now);
    expect([week.bucket, week.buckets.length]).toEqual(['day', 7]);
    expect(week.buckets[6].seconds).toBe(4200);
    expect(week.buckets[0].seconds).toBe(1800);
    const quarter = watchStats(playtime, items, series, '3m', now);
    expect([quarter.bucket, quarter.buckets.at(-1)!.seconds]).toEqual(['week', 4200]);
    const year = watchStats(playtime, items, series, '12m', now);
    expect(year.bucket).toBe('month');
    expect(year.buckets).toHaveLength(13);
    expect(year.buckets.at(-1)!.seconds).toBe(5400 + 600);
    expect(year.buckets.find((b) => b.start.getMonth() === 0)!.seconds).toBe(8400);
  });

  it('shares totals and genres, never titles', () => {
    const summary = summarize(watchStats(playtime, items, series, '30d', now));
    expect(summary).toEqual({ video: 5400, music: 600, films: 1, episodes: 1, songs: 2, genres: { Drama: 3600, Comedy: 1800 } });
    expect(JSON.stringify(summary)).not.toContain('Film');
  });
});
