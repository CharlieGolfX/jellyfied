import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JellyfinApi } from '@/api/client';
import { oldestKept, playedThrough, prunePlaytime, recordPlayedThrough, recordPlaytime, syncPlaytime, type Playtime } from './playtime';

const day = new Date(2026, 9, 21, 20);

function fakeServer(initial: Record<string, string> = {}) {
  let stored = initial;
  const api = {
    get: vi.fn(async () => ({ Id: 'jellyfied-playtime', CustomPrefs: stored })),
    post: vi.fn(async (_path: string, dto: { CustomPrefs: Record<string, string> }) => {
      stored = dto.CustomPrefs;
    }),
  } as unknown as JellyfinApi & { post: ReturnType<typeof vi.fn> };
  return { api, stored: () => stored };
}

describe('playtime', () => {
  beforeEach(() => localStorage.clear());

  it('counts a video as played once most of it has played, a song at half or four minutes', () => {
    expect(playedThrough('video', 70, 100)).toBe(false);
    expect(playedThrough('video', 80, 100)).toBe(true);
    expect(playedThrough('audio', 100, 200)).toBe(true);
    expect(playedThrough('audio', 240, 1200)).toBe(true);
    expect(playedThrough('audio', 30, 200)).toBe(false);
  });

  it("adds what was played to the account's copy, per day, and keeps nothing pending afterwards", async () => {
    recordPlaytime('u1', 'film-a', 'video', 120, day);
    recordPlaytime('u1', 'film-a', 'video', 30, day);
    recordPlayedThrough('u1', 'film-a', 'video', day);
    recordPlaytime('u1', 'song-1', 'audio', 200, day);
    recordPlayedThrough('u1', 'song-1', 'audio', day);
    const server = fakeServer({
      playtime: JSON.stringify({ version: 2, days: { '2026-10-20': { v: 60, a: 0, i: { 'film-b': [60, 1] } } }, since: '2026-10-20' }),
    });

    const total = await syncPlaytime(server.api, 'u1');
    expect(total.days).toEqual({
      '2026-10-20': { v: 60, a: 0, i: { 'film-b': [60, 1] } },
      '2026-10-21': { v: 150, a: 200, ap: 1, i: { 'film-a': [150, 1] } },
    });
    expect(total.since).toBe('2026-10-20');
    expect(JSON.parse(server.stored().playtime)).toEqual(total);
    expect(localStorage.getItem('jellyfied.playtime.pending.u1')).toBeNull();

    // Nothing new: the account's copy is read, not written again.
    await syncPlaytime(server.api, 'u1');
    expect(server.api.post).toHaveBeenCalledTimes(1);
  });

  it('keeps what was played for the next time when saving fails', async () => {
    recordPlaytime('u1', 'film-a', 'video', 90, day);
    const api = { get: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as JellyfinApi;
    await expect(syncPlaytime(api, 'u1')).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem('jellyfied.playtime.pending.u1')!).days['2026-10-21'].v).toBe(90);
  });

  it('reads what the first version stored, which had no days per title', async () => {
    const server = fakeServer({
      playtime: JSON.stringify({
        days: { '2026-10-21': { v: 300, a: 60 } },
        items: { 'film-a': { s: 300, n: 1, k: 'video' }, 'song-1': { s: 60, n: 2, k: 'audio' } },
        since: '2026-10-21',
      }),
    });
    const total = await syncPlaytime(server.api, 'u1');
    expect(total).toEqual({ version: 2, since: '2026-10-21', days: { '2026-10-21': { v: 300, a: 60, ap: 2, i: { 'film-a': [300, 1] } } } });
  });

  it('keeps exactly the last twelve months, 366 days across a 29 February', () => {
    expect(oldestKept(new Date(2026, 9, 21))).toBe('2025-10-22');
    // From 1 March 2028 back over 29 February 2028: 366 days.
    expect(oldestKept(new Date(2028, 2, 1))).toBe('2027-03-02');
    const playtime: Playtime = {
      version: 2,
      since: '2025-01-01',
      days: { '2025-10-21': { v: 1, a: 0 }, '2025-10-22': { v: 2, a: 0 }, '2026-10-21': { v: 3, a: 0 } },
    };
    prunePlaytime(playtime, new Date(2026, 9, 21));
    expect(Object.keys(playtime.days)).toEqual(['2025-10-22', '2026-10-21']);
    expect(playtime.since).toBe('2025-10-22');
  });
});
