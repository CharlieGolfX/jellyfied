import { expect, test, type Page } from '@playwright/test';

/**
 * Playback against a real Jellyfin server. Skipped unless a test account is given:
 *
 *   E2E_USERNAME, E2E_PASSWORD   account to sign in with
 *   E2E_JELLYFIN_URL             Jellyfin address the browser should use (optional; without it the
 *                                instance under test must already know its server, as the container does)
 *   E2E_BASE_URL                 test a running Jellyplex instead of a fresh build (optional)
 *
 * The server needs at least one movie, and a show with two episodes for the last test. The tests
 * change the watched state of what they play.
 */
const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD ?? '';
const jellyfinUrl = process.env.E2E_JELLYFIN_URL;

interface Item {
  Id: string;
  Name: string;
  IndexNumber?: number;
}

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test.describe('playback on a real server', () => {
  test.skip(!username, 'set E2E_USERNAME and E2E_PASSWORD to run the playback tests');
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    if (jellyfinUrl) {
      await page.route('**/config.js', (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `window.JELLYPLEX_CONFIG = ${JSON.stringify({ serverUrl: jellyfinUrl, lockServer: true })};`,
        }),
      );
    }
    await page.goto('/');
    // A server with public users shows a user picker first.
    const manual = page.getByRole('button', { name: /manual/i });
    await expect(page.getByLabel('Username').or(manual).first()).toBeVisible();
    if (!(await page.getByLabel('Username').isVisible())) await manual.click();
    await page.getByLabel('Username').fill(username!);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  });

  /** Asks the server for items with the signed-in session, the way the app does. */
  async function items(page: Page, path: string, query: Record<string, string>): Promise<Item[]> {
    return page.evaluate(
      async (request) => {
        const session = JSON.parse(localStorage.getItem('jellyplex.session')!) as { serverUrl: string; accessToken: string; userId: string };
        const params = new URLSearchParams({ userId: session.userId, ...request.query });
        const res = await fetch(`${session.serverUrl}${request.path}?${params}`, {
          headers: { Authorization: `MediaBrowser Client="Jellyplex e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${session.accessToken}"` },
        });
        return ((await res.json()) as { Items: Item[] }).Items;
      },
      { path, query },
    );
  }

  const video = (page: Page) => page.getByTestId('video');
  const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
  const paused = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.paused);

  async function expectPlaying(page: Page) {
    await expect(video(page)).toBeVisible();
    await expect.poll(() => paused(page), { timeout: 30_000 }).toBe(false);
    const from = await time(page);
    await expect.poll(() => time(page), { timeout: 30_000 }).toBeGreaterThan(from + 0.5);
  }

  /** The controls hide while playing; moving the mouse brings them back. */
  async function showControls(page: Page) {
    await page.mouse.move(300, 300);
    await page.mouse.move(320, 320);
  }

  test('plays a movie, with working controls, menus and mini player', async ({ page }) => {
    const [movie] = await items(page, '/Items', { includeItemTypes: 'Movie', recursive: 'true', sortBy: 'SortName', limit: '1' });
    test.skip(!movie, 'the server has no movies');

    await page.goto(`/item/${movie.Id}`);
    await expect(page.getByRole('heading', { name: movie.Name })).toBeVisible();
    await page.getByRole('button', { name: 'Play from beginning' }).or(page.getByRole('button', { name: 'Play', exact: true })).first().click();
    await expect(page).toHaveURL(new RegExp(`/play/${movie.Id}$`));
    await expectPlaying(page);
    await showControls(page);
    await expect(page.getByText(/^(Direct Play|Direct Stream|Transcode)$/)).toBeVisible();

    // Keyboard: pause, seek, speed, on-screen info.
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(true);
    const before = await time(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => time(page)).toBeGreaterThan(before + 25);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => time(page)).toBeLessThan(before + 25);
    await page.keyboard.press('>');
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.25);
    await page.keyboard.press('<');
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1);
    await page.keyboard.press('m');
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await page.keyboard.press('m');
    await page.keyboard.press('i');
    await expect(page.getByTestId('playback-info')).toBeVisible();
    await page.keyboard.press('i');
    await expect(page.getByTestId('playback-info')).toHaveCount(0);

    // Menus (the controls stay up while paused).
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Quality', { exact: true })).toBeVisible();
    await expect(page.getByText('Sleep timer', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '1.5×' }).click();
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5);
    await page.getByRole('button', { name: 'Normal' }).click();
    await page.getByRole('button', { name: '30 min' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Quality', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('sleep-indicator')).toBeVisible();

    await page.getByRole('button', { name: 'Subtitles' }).click();
    await expect(page.getByRole('button', { name: 'None' })).toBeVisible();
    await page.getByRole('button', { name: 'Picture', exact: true }).click();
    await expect(page.getByRole('button', { name: 'None' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Fill' }).click();
    await expect(page.getByRole('button', { name: 'Reset picture' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset picture' }).click();
    await page.keyboard.press('Escape');

    // Lower quality: the stream is loaded again and continues from the same place.
    const position = await time(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: '1 Mbps 480p' }).click();
    await page.keyboard.press('Space');
    await expectPlaying(page);
    expect(await time(page)).toBeGreaterThan(position - 5);
    await showControls(page);
    await expect(page.getByText('Transcode', { exact: true })).toBeVisible();

    // Mini player: keeps playing while browsing, expands again, and stops.
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/\/play\//);
    await expectPlaying(page);
    // Its buttons appear on hover (the pause button sits over the middle of the picture).
    await video(page).hover({ force: true });
    await page.getByRole('button', { name: 'Expand player' }).click();
    await expect(page).toHaveURL(new RegExp(`/play/${movie.Id}$`));
    await expectPlaying(page);
    await showControls(page);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(video(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/play\//);
  });

  test('moves on to the next episode', async ({ page }) => {
    const [show] = await items(page, '/Items', { includeItemTypes: 'Series', recursive: 'true', sortBy: 'SortName', limit: '1' });
    test.skip(!show, 'the server has no shows');
    const episodes = await items(page, `/Shows/${show.Id}/Episodes`, { limit: '2' });
    test.skip(episodes.length < 2, 'the first show has fewer than two episodes');

    await page.goto(`/item/${episodes[0].Id}`);
    await page.getByRole('button', { name: 'Play from beginning' }).or(page.getByRole('button', { name: 'Play', exact: true })).first().click();
    await expect(page).toHaveURL(new RegExp(`/play/${episodes[0].Id}$`));
    await expectPlaying(page);

    await showControls(page);
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    await page.keyboard.press('n');
    await expect(page).toHaveURL(new RegExp(`/play/${episodes[1].Id}$`));
    await expectPlaying(page);
    await showControls(page);
    await expect(page.getByText(episodes[1].Name).first()).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(video(page)).toHaveCount(0);
  });
});
