import { expect, test, type Browser, type Page, type Request } from '@playwright/test';
// @ts-expect-error -- plain JavaScript for nginx, without type declarations
import picker from '../docker/syncplay-picker.js';
import { mockJellyfin, signIn } from './mockJellyfin';

/**
 * The SyncPlay picker with two members, demo and anna, each in a browser of their own. The picker's
 * own code answers them from one shared store, as the container would.
 */

const GROUP = { GroupId: 'aaaaaaaabbbbccccddddeeeeeeeeeeee', GroupName: "demo's group", State: 'Idle', Participants: ['demo', 'anna'] };
const FILM = { Id: '11111111111111111111111111111111', Name: 'Alpha Film', Type: 'Movie', MediaType: 'Video', ProductionYear: 2021 };
const SHOW = { Id: '22222222222222222222222222222222', Name: 'Beta Show', Type: 'Series', IsFolder: true, ProductionYear: 2019 };
const ITEMS = [FILM, SHOW];

function memoryStore() {
  const map = new Map<string, string>();
  return {
    get: (k: string) => map.get(k),
    set: (k: string, v: string) => void map.set(k, v),
    add: (k: string, v: string) => (map.has(k) ? false : (map.set(k, v), true)),
    keys: () => [...map.keys()],
  };
}

type Store = ReturnType<typeof memoryStore>;

/** What the group's server says once a member's connection is up: that they joined, and maybe more. */
type GroupUpdate = { Type: string; Data: unknown };

async function member(browser: Browser, store: Store, who: { id: string; name: string }, more: GroupUpdate[] = []) {
  const page = await (await browser.newContext()).newPage();
  await mockJellyfin(page, {
    as: who,
    onSocket: (ws) =>
      setTimeout(() => {
        for (const update of [{ Type: 'GroupJoined', Data: GROUP }, ...more])
          ws.send(JSON.stringify({ MessageType: 'SyncPlayGroupUpdate', Data: { GroupId: GROUP.GroupId, ...update } }));
      }, 300),
  });
  await page.route(/\/jellyfin\/Items(\?|\/[0-9a-f]{32})/, (route) => {
    const url = new URL(route.request().url());
    const one = /\/Items\/([0-9a-f]{32})/.exec(url.pathname)?.[1];
    if (one) return route.fulfill({ json: ITEMS.find((i) => i.Id === one) ?? {} });
    const ids = url.searchParams.get('ids')?.split(',');
    const term = url.searchParams.get('searchTerm')?.toLowerCase();
    const found = ITEMS.filter((i) => (ids ? ids.includes(i.Id) : term ? i.Name.toLowerCase().includes(term.slice(0, 3)) : false));
    return route.fulfill({ json: { Items: found, TotalRecordCount: found.length } });
  });
  await page.route('**/jellyfied-api/syncplay/*', async (route) => {
    const req = route.request();
    const res = await picker.handle({
      store,
      method: req.method(),
      groupId: new URL(req.url()).pathname.split('/').pop(),
      body: req.method() === 'POST' ? req.postDataJSON() : null,
      // The wheel's random numbers: the first slice (the film) wins, at a fixed spot.
      random: () => 0.1,
      jellyfin: {
        me: async () => ({ Id: who.id, Name: who.name }),
        group: async () => GROUP,
        item: async (id: string) => ITEMS.find((i) => i.Id === id) ?? null,
      },
    });
    return route.fulfill({ status: res.status, json: res.body });
  });
  await signIn(page, who.name);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  return page;
}

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'SyncPlay' }).click();
  await page.getByRole('button', { name: 'Pick what to watch' }).click();
  return page.getByRole('dialog', { name: 'What shall we watch?' });
}

async function suggest(page: Page, search: string, name: string) {
  const dialog = page.getByRole('dialog', { name: 'What shall we watch?' });
  await dialog.getByRole('searchbox', { name: 'Suggest something' }).fill(search);
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await expect(dialog.getByTestId('picker-suggestion').filter({ hasText: name })).toBeVisible();
}

const isNewQueue = (r: Request) => r.method() === 'POST' && r.url().endsWith('/SyncPlay/SetNewQueue');

test.describe('the SyncPlay picker', () => {
  test.setTimeout(60_000);

  test('members suggest and vote, and once both are ready the wheel picks one and starts it for the group', async ({ browser }) => {
    const store = memoryStore();
    const demo = await member(browser, store, { id: 'user-1', name: 'demo' });
    const anna = await member(browser, store, { id: 'user-2', name: 'anna' });
    const queued: string[][] = [];
    for (const page of [demo, anna]) page.on('request', (r) => isNewQueue(r) && queued.push(r.postDataJSON().PlayingQueue));

    const demoPicker = await openPicker(demo);
    await suggest(demo, 'alpha', 'Alpha Film');
    const annaPicker = await openPicker(anna);
    const film = annaPicker.getByTestId('picker-suggestion').filter({ hasText: 'Alpha Film' });
    await expect(film).toContainText('Suggested by demo');
    await suggest(anna, 'beta', 'Beta Show');

    // One vote each, on the other's suggestion; their own can't be voted for.
    await film.getByRole('button', { name: 'Vote for this' }).click();
    await expect(film.getByRole('button', { name: 'Take back your vote' })).toContainText('1');
    await expect(annaPicker.getByRole('button', { name: 'You can’t vote for your own suggestion' })).toBeDisabled();
    const show = demoPicker.getByTestId('picker-suggestion').filter({ hasText: 'Beta Show' });
    await expect(show).toBeVisible({ timeout: 10_000 });
    await show.getByRole('button', { name: 'Vote for this' }).click();

    // Only the host (demo, who is first in the group) can spin by hand.
    await expect(demoPicker.getByRole('button', { name: 'Spin now' })).toBeVisible();
    await expect(annaPicker.getByRole('button', { name: 'Spin now' })).toHaveCount(0);

    await annaPicker.getByRole('button', { name: 'I’m ready' }).click();
    await expect(annaPicker.getByText('1 of 2 ready')).toBeVisible();
    await demoPicker.getByRole('button', { name: 'I’m ready' }).click();

    // Both see the wheel stop on the same winner, and one of them starts it for the group.
    const winners = await Promise.all(
      [demoPicker, annaPicker].map(async (p) => {
        const winner = p.getByTestId('picker-winner');
        await expect(winner).toBeVisible({ timeout: 15_000 });
        return winner.textContent();
      }),
    );
    expect(winners[0]).toBe(winners[1]);
    expect(winners[0]).toBe('Alpha Film');
    await expect.poll(() => queued, { timeout: 15_000 }).toEqual([[FILM.Id]]);
  });

  test('the host can spin before everyone is ready', async ({ browser }) => {
    const store = memoryStore();
    const demo = await member(browser, store, { id: 'user-1', name: 'demo' });
    const queued: string[][] = [];
    demo.on('request', (r) => isNewQueue(r) && queued.push(r.postDataJSON().PlayingQueue));
    const demoPicker = await openPicker(demo);
    await expect(demoPicker.getByRole('button', { name: 'Spin now' })).toBeDisabled();
    await suggest(demo, 'alpha', 'Alpha Film');
    await demoPicker.getByRole('button', { name: 'Spin now' }).click();
    await expect(demoPicker.getByTestId('picker-winner')).toHaveText('Alpha Film', { timeout: 15_000 });
    await expect.poll(() => queued, { timeout: 15_000 }).toEqual([[FILM.Id]]);
    await expect(demoPicker).toHaveCount(0);
  });

  test('the group badge in the player opens it too', async ({ browser }) => {
    const queue = {
      Reason: 'NewPlaylist',
      LastUpdate: new Date().toISOString(),
      Playlist: [{ ItemId: FILM.Id, PlaylistItemId: 'entry-1' }],
      PlayingItemIndex: 0,
      StartPositionTicks: 0,
      IsPlaying: false,
    };
    const demo = await member(browser, memoryStore(), { id: 'user-1', name: 'demo' }, [{ Type: 'PlayQueue', Data: queue }]);
    await expect(demo).toHaveURL(/\/play\//, { timeout: 10_000 });
    // The fake server has no video to play, and the player's message about that covers the badge.
    await demo.getByRole('button', { name: 'Pick what to watch' }).dispatchEvent('click');
    await expect(demo.getByRole('dialog', { name: 'What shall we watch?' })).toBeVisible();
  });
});
