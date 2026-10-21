import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JellyfinApi } from '@/api/client';
import { playedThrough, recordPlayedThrough, recordPlaytime, syncPlaytime } from './playtime';

const day = new Date(2026, 9, 21, 20);

describe('playtime', () => {
  beforeEach(() => localStorage.clear());

  it('counts a video as played once most of it has played, a song at half or four minutes', () => {
    expect(playedThrough('video', 70, 100)).toBe(false);
    expect(playedThrough('video', 80, 100)).toBe(true);
    expect(playedThrough('audio', 100, 200)).toBe(true);
    expect(playedThrough('audio', 240, 1200)).toBe(true);
    expect(playedThrough('audio', 30, 200)).toBe(false);
  });

  it("adds what was played to the account's copy, and keeps nothing pending afterwards", async () => {
    recordPlaytime('u1', 'film-a', 'video', 120, day);
    recordPlaytime('u1', 'film-a', 'video', 30, day);
    recordPlayedThrough('u1', 'film-a', 'video');
    let stored: Record<string, string> = {
      playtime: JSON.stringify({
        days: { '2026-10-20': { v: 60, a: 0 } },
        items: { 'film-b': { s: 60, n: 1, k: 'video' } },
        since: '2026-10-20',
      }),
    };
    const api = {
      get: vi.fn(async () => ({ Id: 'jellyfied-playtime', CustomPrefs: stored })),
      post: vi.fn(async (_path: string, dto: { CustomPrefs: Record<string, string> }) => {
        stored = dto.CustomPrefs;
      }),
    } as unknown as JellyfinApi;

    const total = await syncPlaytime(api, 'u1');
    expect(total.days).toEqual({ '2026-10-20': { v: 60, a: 0 }, '2026-10-21': { v: 150, a: 0 } });
    expect(total.items['film-a']).toEqual({ s: 150, n: 1, k: 'video' });
    expect(total.since).toBe('2026-10-20');
    expect(JSON.parse(stored.playtime)).toEqual(total);
    expect(localStorage.getItem('jellyfied.playtime.pending.u1')).toBeNull();

    // Nothing new: the account's copy is read, not written again.
    await syncPlaytime(api, 'u1');
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('keeps what was played for the next time when saving fails', async () => {
    recordPlaytime('u1', 'film-a', 'video', 90, day);
    const api = { get: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as JellyfinApi;
    await expect(syncPlaytime(api, 'u1')).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem('jellyfied.playtime.pending.u1')!).items['film-a'].s).toBe(90);
  });
});
