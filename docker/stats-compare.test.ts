import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript for nginx, without type declarations
import stats from './stats-compare.js';

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    get: (k: string) => map.get(k),
    set: (k: string, v: string) => void map.set(k, v),
    del: (k: string) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

let store: ReturnType<typeof memoryStore>;
const DAY = 86_400_000;
const NOW = 100 * DAY;

const summary = (video: number, genres: Record<string, number> = {}, extra: Record<string, number> = {}) => ({
  video,
  music: 0,
  films: 0,
  episodes: 0,
  songs: 0,
  genres,
  ...extra,
});

async function as(user: string | null, method: string, opts: { range?: string; body?: unknown; now?: number; minUsers?: number } = {}) {
  const res = await stats.handle({
    store,
    method,
    range: opts.range ?? '30d',
    body: opts.body,
    now: opts.now ?? NOW,
    minUsers: opts.minUsers ?? 3,
    hash: (id: string) => createHash('sha256').update(id).digest('hex'),
    jellyfin: { me: async () => (user ? { Id: user, Name: user } : null) },
  });
  return res as { status: number; body: Record<string, unknown> & { statements?: Record<string, unknown>[] } };
}

// Each share a day apart, as the app sends them, so none is turned away for coming too soon.
let clock = 0;
const share = (user: string, s: ReturnType<typeof summary>, now = NOW) =>
  as(user, 'POST', { body: { summaries: { '30d': s } }, now: now - DAY + (clock += 1) });

beforeEach(() => {
  store = memoryStore();
  clock = 0;
});

describe('comparing stats', () => {
  it('only answers signed-in users', async () => {
    expect((await as(null, 'GET')).status).toBe(401);
  });

  it('keeps users under a hash, never their id or name', async () => {
    await share('ann-id', summary(100));
    expect([...store.map.keys()].join()).not.toContain('ann');
    expect([...store.map.values()].join()).not.toContain('ann');
  });

  it('says nothing until enough people take part', async () => {
    expect((await as('ann', 'GET')).body).toMatchObject({ joined: false, participants: 0 });
    await share('ann', summary(5000, { Drama: 4000 }));
    await share('bob', summary(100));
    expect((await as('ann', 'GET')).body).toMatchObject({ joined: true, enough: false, participants: 2 });
  });

  it('tells people how they compare, without anyone else’s numbers', async () => {
    await share('ann', summary(9000, { Drama: 6000, Comedy: 100 }, { films: 3 }));
    await share('bob', summary(4000, { Drama: 2000, Comedy: 2000 }, { films: 1 }));
    await share('cat', summary(1000, { Comedy: 900 }, { films: 5 }));
    const ann = (await as('ann', 'GET')).body;
    expect(ann.statements).toEqual([
      { type: 'most', metric: 'video' },
      { type: 'more', metric: 'films', share: 50 },
      { type: 'mostGenre', genre: 'Drama' },
    ]);
    expect(JSON.stringify(ann)).not.toMatch(/4000|2000|bob|cat/);
    const bob = (await as('bob', 'GET')).body;
    expect(bob.statements).toEqual([
      { type: 'more', metric: 'video', share: 50 },
      { type: 'mostGenre', genre: 'Comedy' },
    ]);
  });

  it('leaves out people who haven’t been around for a week', async () => {
    await share('ann', summary(100), NOW - 8 * DAY);
    await share('bob', summary(200));
    await share('cat', summary(300));
    expect((await as('bob', 'GET')).body).toMatchObject({ participants: 2, enough: false });
  });

  it('forgets someone who stops taking part', async () => {
    await share('ann', summary(100));
    expect((await as('ann', 'DELETE')).body).toEqual({ joined: false });
    expect([...store.map.keys()].filter((k) => k.startsWith('u|'))).toEqual([]);
  });

  it('lets a summary be replaced only twice a day, leaving and joining again included', async () => {
    await share('bob', summary(4000));
    await share('cat', summary(1000));
    await as('ann', 'POST', { body: { summaries: { '30d': summary(100) } } });
    // Probing: a made-up number right after is ignored, so the answer doesn't change.
    expect((await as('ann', 'POST', { body: { summaries: { '30d': summary(4500) } } })).body.statements).toEqual([]);
    await as('ann', 'DELETE');
    expect((await as('ann', 'POST', { body: { summaries: { '30d': summary(4500) } } })).body.joined).toBe(false);
    const later = await as('ann', 'POST', { body: { summaries: { '30d': summary(6000) } }, now: NOW + 13 * 3600_000 });
    expect(later.body.statements).toEqual([{ type: 'most', metric: 'video' }]);
  });

  it('keeps numbers rounded down to steps a quarter apart, so close ones can’t be told apart', async () => {
    await share('bob', summary(4000));
    await share('cat', summary(1000));
    await share('ann', summary(4100));
    expect((await as('ann', 'GET')).body.statements).toEqual([{ type: 'more', metric: 'video', share: 50 }]);
  });

  it('keeps only numbers and a few genres of what is sent', async () => {
    const genres = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`G${i}`, 10]));
    await as('ann', 'POST', { body: { summaries: { '30d': { video: 'lots', genres, title: 'Secret film' }, other: {} } } });
    const kept = JSON.parse([...store.map.entries()].find(([k]) => k.startsWith('u|'))![1]);
    expect(Object.keys(kept.s)).toEqual(['30d']);
    expect(kept.s['30d'].video).toBe(0);
    expect(Object.keys(kept.s['30d'].genres)).toHaveLength(25);
    expect(JSON.stringify(kept)).not.toContain('Secret');
  });
});
