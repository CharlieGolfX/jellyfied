import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * SyncPlay between two people on a real Jellyfin server, each in a browser of their own. Skipped
 * unless both accounts are given (`node e2e/server/setup.mjs up` makes a server with them):
 *
 *   E2E_USERNAME, E2E_PASSWORD                 the one who creates the group and starts playback
 *   E2E_FRIEND_USERNAME, E2E_FRIEND_PASSWORD   the one who joins it
 *   E2E_BASE_URL                               a Jellyfied that proxies that server
 *
 * The mocked tests can't catch what goes wrong between real sessions (which app a session belongs
 * to, several tabs, the realtime connection), so this follows a group from start to pause.
 */
const owner = { name: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD ?? '' };
const friend = { name: process.env.E2E_FRIEND_USERNAME, password: process.env.E2E_FRIEND_PASSWORD ?? '' };

test.skip(!owner.name || !friend.name, 'set E2E_USERNAME and E2E_FRIEND_USERNAME (and passwords) to run');
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

async function signedIn(browser: Browser, account: { name?: string; password: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const manual = page.getByRole('button', { name: /manual/i });
  await expect(page.getByLabel('Username').or(manual).first()).toBeVisible();
  if (!(await page.getByLabel('Username').isVisible())) await manual.click();
  await page.getByLabel('Username').fill(account.name!);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  return page;
}

/** The first film on the server, asked for with the page's own session. */
function firstMovie(page: Page): Promise<{ Id: string; Name: string }> {
  return page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string; userId: string };
    const q = new URLSearchParams({ userId: s.userId, includeItemTypes: 'Movie', recursive: 'true', sortBy: 'SortName', limit: '1' });
    const res = await fetch(`${s.serverUrl}/Items?${q}`, {
      headers: {
        Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e-sync", Version="1", Token="${s.accessToken}"`,
      },
    });
    return ((await res.json()) as { Items: { Id: string; Name: string }[] }).Items[0];
  });
}

const video = (page: Page) => page.getByTestId('video');
const paused = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.paused);
const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);

/** Closes the player and leaves the group from the menu. */
async function leave(page: Page) {
  await page.mouse.move(300, 300);
  await page
    .getByRole('button', { name: 'Stop playback' })
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.getByRole('button', { name: /^SyncPlay/ }).click({ timeout: 5000 });
  await page.getByRole('button', { name: 'Leave group' }).click({ timeout: 5000 });
}

test('a group plays and pauses together', async ({ browser }) => {
  test.setTimeout(120_000);
  const [host, guest] = await Promise.all([signedIn(browser, owner), signedIn(browser, friend)]);
  try {
    // The host makes a group…
    await host.getByRole('button', { name: 'SyncPlay' }).click();
    await host.getByRole('button', { name: 'Create a group' }).click();
    await host.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(host.getByTestId('syncplay-group-name')).toHaveText(`${owner.name}'s group`);
    await host.keyboard.press('Escape');

    // …the guest finds it in the list and joins…
    await guest.getByRole('button', { name: 'SyncPlay' }).click();
    await guest
      .getByTestId('syncplay-group')
      .filter({ hasText: `${owner.name}'s group` })
      .click();
    await expect(guest.getByTestId('syncplay-participants')).toContainText(owner.name!);
    await expect(guest.getByTestId('syncplay-participants')).toContainText(friend.name!);
    await guest.keyboard.press('Escape');

    // …and when the host starts a film, it starts for the guest as well.
    const movie = await firstMovie(host);
    await host.goto(`/item/${movie.Id}`);
    await host.getByRole('button', { name: 'Play', exact: true }).first().click();
    for (const page of [host, guest]) {
      await expect(video(page)).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => paused(page), { timeout: 30_000 }).toBe(false);
    }
    const from = await time(guest);
    await expect.poll(() => time(guest), { timeout: 30_000 }).toBeGreaterThan(from + 1);
    await expect(guest.getByText(movie.Name).first()).toBeAttached();

    // Pausing pauses everyone, close to the same moment…
    await host.mouse.move(300, 300);
    await host.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(() => paused(guest), { timeout: 15_000 }).toBe(true);
    const [a, b] = await Promise.all([time(host), time(guest)]);
    expect(Math.abs(a - b)).toBeLessThan(2);

    // …and so does carrying on.
    await host.mouse.move(320, 320);
    await host.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => paused(guest), { timeout: 15_000 }).toBe(false);
  } finally {
    // Both leave, so the group ends and the next run starts clean.
    await Promise.allSettled([leave(host), leave(guest)]);
    await Promise.allSettled([host.context().close(), guest.context().close()]);
  }
});

/** The first song on the server. */
function firstSong(page: Page): Promise<{ Id: string; Name: string; AlbumId?: string } | undefined> {
  return page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string; userId: string };
    const q = new URLSearchParams({ userId: s.userId, includeItemTypes: 'Audio', recursive: 'true', sortBy: 'SortName', limit: '1' });
    const res = await fetch(`${s.serverUrl}/Items?${q}`, {
      headers: {
        Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e-sync", Version="1", Token="${s.accessToken}"`,
      },
    });
    return ((await res.json()) as { Items: { Id: string; Name: string; AlbumId?: string }[] }).Items[0];
  });
}

test('a group listens to music together', async ({ browser }) => {
  test.setTimeout(120_000);
  const [host, guest] = await Promise.all([signedIn(browser, owner), signedIn(browser, friend)]);
  const bar = (page: Page) =>
    page.getByRole('button', { name: 'Close player' }).locator('xpath=ancestor::div[contains(@class,"border-t")][1]');
  try {
    const song = await firstSong(host);
    test.skip(!song, 'the server has no music');
    await host.getByRole('button', { name: 'SyncPlay' }).click();
    await host.getByRole('button', { name: 'Create a group' }).click();
    await host.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(host.getByTestId('syncplay-group-name')).toHaveText(`${owner.name}'s group`);
    await host.keyboard.press('Escape');
    await guest.getByRole('button', { name: 'SyncPlay' }).click();
    await guest
      .getByTestId('syncplay-group')
      .filter({ hasText: `${owner.name}'s group` })
      .click();
    await expect(guest.getByTestId('syncplay-participants')).toContainText(owner.name!);
    await guest.keyboard.press('Escape');

    // The host plays a song: it plays in both music players.
    await host.goto(`/item/${song!.AlbumId ?? song!.Id}`);
    await host.getByRole('button', { name: 'Play', exact: true }).first().click();
    for (const page of [host, guest]) {
      await expect(bar(page).getByText(song!.Name).first()).toBeVisible({ timeout: 30_000 });
      await expect(bar(page).getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 30_000 });
      await expect(bar(page).getByLabel('Playing with your SyncPlay group')).toBeAttached();
    }

    // Pausing it pauses it for everyone, and so does playing on.
    await bar(host).getByRole('button', { name: 'Pause' }).click();
    await expect(bar(guest).getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 15_000 });
    await bar(guest).getByRole('button', { name: 'Play', exact: true }).click();
    await expect(bar(host).getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });

    // Repeat and shuffle are the group's: one member changes them, the other sees it.
    await bar(host).getByTitle('Repeat: off').click();
    await expect(bar(guest).getByTitle('Repeat: all')).toBeVisible({ timeout: 15_000 });
    await bar(guest).getByRole('button', { name: 'Queue' }).click();
    await guest.getByRole('button', { name: 'Shuffle the group’s queue' }).click();
    await bar(host).getByRole('button', { name: 'Queue' }).click();
    await expect(host.getByRole('button', { name: 'Shuffle the group’s queue' })).toHaveAttribute('aria-pressed', 'true', {
      timeout: 15_000,
    });
  } finally {
    for (const page of [host, guest]) {
      await page
        .getByRole('button', { name: 'Close player' })
        .click({ timeout: 5000 })
        .catch(() => {});
      await page
        .getByRole('button', { name: /^SyncPlay/ })
        .click({ timeout: 5000 })
        .catch(() => {});
      await page
        .getByRole('button', { name: 'Leave group' })
        .click({ timeout: 5000 })
        .catch(() => {});
    }
    await Promise.allSettled([host.context().close(), guest.context().close()]);
  }
});
