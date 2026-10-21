import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@/api/types';
import { watchStats, weekStart } from './watchStats';

const hour = 3600 * 10_000_000;
const item = (fields: Partial<BaseItemDto> & { plays?: number; last?: string }): BaseItemDto =>
  ({
    Id: fields.Name ?? 'x',
    Type: 'Movie',
    RunTimeTicks: hour,
    ...fields,
    UserData: { Played: true, PlayCount: fields.plays ?? 1, LastPlayedDate: fields.last },
  }) as BaseItemDto;

const now = new Date(2026, 9, 21, 12); // a Wednesday

describe('watchStats', () => {
  const watched = [
    item({ Name: 'Film A', Genres: ['Drama'], plays: 3, last: new Date(2026, 9, 20).toISOString() }),
    item({ Name: 'Film B', Genres: ['Comedy', 'Drama'], last: new Date(2026, 9, 12).toISOString() }),
    item({ Name: 'Ep 1', Type: 'Episode', SeriesId: 'show-1', RunTimeTicks: hour / 2, last: new Date(2026, 9, 19).toISOString() }),
    item({ Name: 'Ep 2', Type: 'Episode', SeriesId: 'show-1', RunTimeTicks: hour / 2, last: new Date(2025, 0, 1).toISOString() }),
  ];
  const stats = watchStats(watched, new Map([['show-1', ['Comedy']]]), [item({ Type: 'Audio', plays: 4 }), item({ Type: 'Audio' })], now);

  it('adds up time, rewatches included, and counts what was watched', () => {
    expect(stats.seconds).toBe(5 * 3600);
    expect([stats.films, stats.episodes, stats.shows, stats.songPlays]).toEqual([2, 2, 1, 5]);
  });

  it("ranks genres by time, taking a show's genres for its episodes", () => {
    expect(stats.genres).toEqual([
      { name: 'Drama', seconds: 4 * 3600 },
      { name: 'Comedy', seconds: 2 * 3600 },
    ]);
  });

  it('lists films watched more than once', () => {
    expect(stats.rewatched.map((r) => [r.item.Name, r.plays])).toEqual([['Film A', 3]]);
  });

  it('counts the last twelve weeks by when things were last played', () => {
    expect(stats.weeks).toHaveLength(12);
    expect(stats.weeks[11].start).toEqual(weekStart(now));
    expect(stats.weeks[11].count).toBe(2); // Monday 19th and Tuesday 20th
    expect(stats.weeks[10].count).toBe(1);
    expect(stats.weeks.reduce((n, w) => n + w.count, 0)).toBe(3);
  });
});
