import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@/api/types';
import type { Playtime } from './playtime';
import { watchStats, weekStart } from './watchStats';

const item = (fields: Partial<BaseItemDto>) => ({ Type: 'Movie', ...fields }) as BaseItemDto;
const now = new Date(2026, 9, 21, 12); // a Wednesday

describe('watchStats', () => {
  const playtime: Playtime = {
    since: '2026-10-01',
    days: {
      '2026-10-20': { v: 3 * 3600, a: 600 },
      '2026-10-12': { v: 3600, a: 0 },
      '2025-01-01': { v: 1800, a: 0 },
    },
    items: {
      'film-a': { s: 3 * 3600, n: 2, k: 'video' },
      'film-b': { s: 1200, n: 0, k: 'video' },
      'ep-1': { s: 1800, n: 1, k: 'video' },
      'song-1': { s: 600, n: 3, k: 'audio' },
    },
  };
  const items = new Map([
    ['film-a', item({ Id: 'film-a', Name: 'Film A', Genres: ['Drama'] })],
    ['film-b', item({ Id: 'film-b', Name: 'Film B', Genres: ['Comedy'] })],
    // Marked as watched on the server, but never played: not in the playtime, so not counted.
    ['film-c', item({ Id: 'film-c', Name: 'Film C', UserData: { Played: true, PlayCount: 1 } })],
    ['ep-1', item({ Id: 'ep-1', Type: 'Episode', SeriesId: 'show-1' })],
  ]);
  const stats = watchStats(playtime, items, new Map([['show-1', ['Comedy']]]), now);

  it('adds up the time actually played', () => {
    expect(stats.seconds).toBe(4.5 * 3600);
    expect(stats.musicSeconds).toBe(600);
  });

  it('counts only what was played through, and nothing merely marked as watched', () => {
    expect([stats.films, stats.episodes, stats.shows, stats.songPlays]).toEqual([1, 1, 1, 3]);
    expect(stats.rewatched.map((r) => [r.item.Name, r.plays])).toEqual([['Film A', 2]]);
  });

  it("ranks genres by time played, taking a show's genres for its episodes", () => {
    expect(stats.genres).toEqual([
      { name: 'Drama', seconds: 3 * 3600 },
      { name: 'Comedy', seconds: 3000 },
    ]);
  });

  it('adds up the last twelve weeks', () => {
    expect(stats.weeks).toHaveLength(12);
    expect(stats.weeks[11].start).toEqual(weekStart(now));
    expect(stats.weeks[11].seconds).toBe(3 * 3600 + 600);
    expect(stats.weeks[10].seconds).toBe(3600);
    expect(stats.since).toEqual(new Date(2026, 9, 1));
  });
});
