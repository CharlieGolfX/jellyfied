import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript for nginx, without type declarations
import picker from './syncplay-picker.js';

const GID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const MOVIE = '11111111111111111111111111111111';
const SHOW = '22222222222222222222222222222222';
const SONG = '33333333333333333333333333333333';

interface Body {
  error?: string;
  go?: boolean;
  round: number;
  host: string | null;
  participants: { name: string; ready: boolean }[];
  suggestions: { id: string; by: string; votes: number; mine: boolean; voted: boolean }[];
  spin: { round: number; winner: string; by: string | null; entries: { id: string; weight: number }[] } | null;
}

function memoryStore() {
  const map = new Map<string, string>();
  return {
    get: (k: string) => map.get(k),
    set: (k: string, v: string) => void map.set(k, v),
    add: (k: string, v: string) => (map.has(k) ? false : (map.set(k, v), true)),
    keys: () => [...map.keys()],
  };
}

let store: ReturnType<typeof memoryStore>;
let members: string[];
const users: Record<string, string> = { ann: 'a1', bob: 'b2', cat: 'c3' };
const items: Record<string, string> = { [MOVIE]: 'Movie', [SHOW]: 'Series', [SONG]: 'Audio' };

async function as(name: string, method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>, random = () => 0) {
  const res = await picker.handle({
    store,
    method,
    groupId: GID,
    body,
    now: 1000,
    random,
    jellyfin: {
      me: async () => (users[name] ? { Id: users[name], Name: name } : null),
      group: async () => ({ Participants: members }),
      item: async (id: string) => (items[id] ? { Id: id, Type: items[id] } : null),
    },
  });
  return res as { status: number; body: Body };
}

beforeEach(() => {
  store = memoryStore();
  members = ['ann', 'bob'];
});

describe('the SyncPlay picker', () => {
  it('only answers members of the group', async () => {
    expect((await as('nobody')).status).toBe(401);
    expect((await as('cat')).status).toBe(403);
    const res = await as('ann');
    expect(res.status).toBe(200);
    expect(res.body.participants).toEqual([
      { name: 'ann', ready: false },
      { name: 'bob', ready: false },
    ]);
  });

  it('takes films, shows and episodes once each', async () => {
    expect((await as('ann', 'POST', { action: 'suggest', itemId: MOVIE })).status).toBe(200);
    expect((await as('bob', 'POST', { action: 'suggest', itemId: MOVIE })).status).toBe(409);
    expect((await as('bob', 'POST', { action: 'suggest', itemId: SONG })).status).toBe(400);
    const res = await as('bob', 'POST', { action: 'suggest', itemId: SHOW });
    expect(res.body.suggestions.map((s) => [s.id, s.by, s.mine])).toEqual([
      [MOVIE, 'ann', false],
      [SHOW, 'bob', true],
    ]);
  });

  it('gives one vote per suggestion, never for your own, and it can be taken back', async () => {
    await as('ann', 'POST', { action: 'suggest', itemId: MOVIE });
    expect((await as('ann', 'POST', { action: 'vote', itemId: MOVIE, on: true })).status).toBe(409);
    await as('bob', 'POST', { action: 'vote', itemId: MOVIE, on: true });
    let res = await as('bob', 'POST', { action: 'vote', itemId: MOVIE, on: true });
    expect(res.body.suggestions[0]).toMatchObject({ votes: 1, voted: true });
    res = await as('bob', 'POST', { action: 'vote', itemId: MOVIE, on: false });
    expect(res.body.suggestions[0]).toMatchObject({ votes: 0, voted: false });
  });

  it('spins by itself once everyone is ready, weighting each suggestion by its votes plus one', async () => {
    await as('ann', 'POST', { action: 'suggest', itemId: MOVIE });
    await as('ann', 'POST', { action: 'suggest', itemId: SHOW });
    await as('bob', 'POST', { action: 'vote', itemId: SHOW, on: true });
    let res = await as('ann', 'POST', { action: 'ready', on: true });
    expect(res.body.spin).toBeNull();
    // 0.5 of a total weight of 3 (film 1, show 2) lands on the show.
    res = await as('bob', 'POST', { action: 'ready', on: true }, () => 0.5);
    expect(res.body.spin).toMatchObject({
      round: 0,
      winner: SHOW,
      by: null,
      entries: [
        { id: MOVIE, weight: 1 },
        { id: SHOW, weight: 2 },
      ],
    });
    // A new round: nobody is ready, and the winner is off the list.
    expect(res.body.round).toBe(1);
    expect(res.body.participants.every((p) => !p.ready)).toBe(true);
    expect(res.body.suggestions.map((s) => s.id)).toEqual([MOVIE]);
  });

  it('lets only the host spin by hand: whoever made the group, while they are in it', async () => {
    members = ['ann'];
    await as('ann', 'POST', { action: 'claim' });
    members = ['bob', 'ann'];
    expect((await as('bob', 'POST', { action: 'claim' })).status).toBe(409);
    await as('bob', 'POST', { action: 'suggest', itemId: MOVIE });
    expect((await as('bob', 'POST', { action: 'spin' })).status).toBe(403);
    const res = await as('ann', 'POST', { action: 'spin' });
    expect(res.body).toMatchObject({ host: 'ann', spin: { winner: MOVIE, by: 'ann' } });

    members = ['bob'];
    expect((await as('bob')).body.host).toBe('bob');
  });

  it('has the winner started by one member only', async () => {
    await as('ann', 'POST', { action: 'suggest', itemId: MOVIE });
    await as('ann', 'POST', { action: 'spin' });
    expect((await as('bob', 'POST', { action: 'start', round: 0 })).body.go).toBe(true);
    expect((await as('ann', 'POST', { action: 'start', round: 0 })).body.go).toBe(false);
  });

  it('cannot spin an empty wheel', async () => {
    expect((await as('ann', 'POST', { action: 'spin' })).status).toBe(409);
    await as('ann', 'POST', { action: 'ready', on: true });
    expect((await as('bob', 'POST', { action: 'ready', on: true })).body.spin).toBeNull();
  });
});
