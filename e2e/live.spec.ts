import { expect, test, type Page } from '@playwright/test';

/**
 * Playback against a real Jellyfin server. Skipped unless a test account is given:
 *
 *   E2E_USERNAME, E2E_PASSWORD   account to sign in with
 *   E2E_JELLYFIN_URL             Jellyfin address the browser should use (optional; without it the
 *                                instance under test must already know its server, as the container does)
 *   E2E_BASE_URL                 test a running Jellyfied instead of a fresh build (optional)
 *
 * The server needs at least one movie. Tests that need more (a show with two episodes, a video
 * with styled or image subtitles) are skipped when the library has none. The tests change the
 * watched state of what they play, and the account's Jellyfied preferences.
 */
const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD ?? '';
const jellyfinUrl = process.env.E2E_JELLYFIN_URL;

interface Item {
  Id: string;
  Name: string;
  IndexNumber?: number;
  MediaStreams?: { Type: string; Codec?: string; Index: number }[];
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
          body: `window.JELLYFIED_CONFIG = ${JSON.stringify({ serverUrl: jellyfinUrl, lockServer: true })};`,
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
  /** Collects requests for the file hls.js is built into, from now on. */
  function watchForHls(page: Page): string[] {
    const seen: string[] = [];
    page.on('request', (request) => {
      if (/\/assets\/hls-[\w-]+\.js$/.test(new URL(request.url()).pathname)) seen.push(request.url());
    });
    return seen;
  }

  async function items(page: Page, path: string, query: Record<string, string>): Promise<Item[]> {
    return page.evaluate(
      async (request) => {
        const session = JSON.parse(localStorage.getItem('jellyfied.session')!) as {
          serverUrl: string;
          accessToken: string;
          userId: string;
        };
        const params = new URLSearchParams({ userId: session.userId, ...request.query });
        const res = await fetch(`${session.serverUrl}${request.path}?${params}`, {
          headers: {
            Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${session.accessToken}"`,
          },
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
    await page
      .getByRole('button', { name: 'Play from beginning' })
      .or(page.getByRole('button', { name: 'Play', exact: true }))
      .first()
      .click();
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

    // The mouse wheel over the volume control: down is quieter, up is louder.
    const volume = () => video(page).evaluate((v: HTMLVideoElement) => Math.round(v.volume * 100));
    const loud = await volume();
    await page.getByRole('button', { name: 'Mute', exact: true }).hover();
    await page.mouse.wheel(0, 200);
    await expect.poll(volume).toBe(Math.max(0, loud - 10));
    await page.mouse.wheel(0, -100);
    await expect.poll(volume).toBe(Math.max(0, loud - 10) + 5);
    await page.mouse.wheel(0, -100);

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
    const shows = await items(page, '/Items', { includeItemTypes: 'Series', recursive: 'true', sortBy: 'SortName', limit: '10' });
    test.skip(shows.length === 0, 'the server has no shows');
    let episodes: Item[] = [];
    for (const show of shows) {
      episodes = await items(page, `/Shows/${show.Id}/Episodes`, { limit: '2', isMissing: 'false' });
      if (episodes.length >= 2) break;
    }
    test.skip(episodes.length < 2, 'none of the first ten shows has two episodes');

    await page.goto(`/item/${episodes[0].Id}`);
    await page
      .getByRole('button', { name: 'Play from beginning' })
      .or(page.getByRole('button', { name: 'Play', exact: true }))
      .first()
      .click();
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
  /** Starts a video and switches on one of its subtitle tracks (the first with one of the codecs) from the player's menu. */
  async function playWithSubtitle(page: Page, ...codecs: string[]) {
    const wanted = (s: { Type: string; Codec?: string }) => s.Type === 'Subtitle' && codecs.includes(s.Codec?.toLowerCase() ?? '');
    const videos = await items(page, '/Items', {
      includeItemTypes: 'Movie,Episode',
      recursive: 'true',
      fields: 'MediaStreams',
      limit: '400',
    });
    const item = videos.find((v) => v.MediaStreams?.some(wanted));
    test.skip(!item, `no video with ${codecs.join(' or ')} subtitles in the first 400`);
    const subtitles = item!.MediaStreams!.filter((s) => s.Type === 'Subtitle');
    const position = subtitles.findIndex(wanted);

    await page.goto(`/item/${item!.Id}`);
    await page
      .getByRole('button', { name: 'Play from beginning' })
      .or(page.getByRole('button', { name: 'Play', exact: true }))
      .first()
      .click();
    await expectPlaying(page);
    await showControls(page);
    await page.getByRole('button', { name: 'Subtitles' }).click();
    // The menu lists "None" and then the tracks in the file's order.
    const menu = page.getByRole('button', { name: 'Subtitles' }).locator('xpath=following-sibling::div');
    await menu
      .getByRole('button')
      .nth(position + 1)
      .click();
  }

  test('draws styled (ASS) subtitles in the browser, without the server re-encoding for them', async ({ page }) => {
    await playWithSubtitle(page, 'ass');
    await showControls(page);
    await page.getByRole('button', { name: 'Subtitles' }).click();
    await expect(page.getByText('These subtitles bring their own fonts, colours and positions.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('subtitle-delay')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    await expectPlaying(page);
  });

  test('draws image (PGS) subtitles in the browser, and lets them be shifted', async ({ page }) => {
    await playWithSubtitle(page, 'pgssub');
    await showControls(page);
    await page.getByRole('button', { name: 'Subtitles' }).click();
    await expect(page.getByText('These subtitles are pictures, so their size and colour are fixed.')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Show subtitles later' }).click();
    await expect(page.getByTestId('subtitle-delay')).toHaveText('+0.1 s');
    await expectPlaying(page);
  });

  // Needs a Matroska file whose index covers its DVD subtitles (mkvmerge and ffmpeg write that).
  test('draws DVD (VobSub) subtitles in the browser, read out of the video file', async ({ page }) => {
    await playWithSubtitle(page, 'dvdsub');
    await showControls(page);
    await page.getByRole('button', { name: 'Subtitles' }).click();
    await expect(page.getByText('These subtitles are pictures, so their size and colour are fixed.')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByTestId('subtitle-delay')).toBeVisible();
    await expectPlaying(page);
  });

  test('shows styled subtitles as plain text when their styling is switched off', async ({ page }) => {
    // Kept to this browser: the other tests, which may be running on the same account, want the styling.
    await page.addInitScript(() => localStorage.setItem('jellyfied.syncPrefs', 'off'));
    await page.goto('/settings');
    const styling = page.getByRole('switch', { name: 'Keep the styling of styled subtitles' });
    if ((await styling.getAttribute('aria-checked')) === 'true') await styling.click();
    await expect(styling).toHaveAttribute('aria-checked', 'false');

    await playWithSubtitle(page, 'ass');
    await showControls(page);
    await page.getByRole('button', { name: 'Subtitles' }).click();
    // Plain text has a size to choose; nothing is drawn on a canvas, and nothing is burned in.
    await expect(page.getByText('Text size')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('These subtitles bring their own fonts, colours and positions.')).toHaveCount(0);
    await expect(page.getByTestId('subtitle-delay')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('has image subtitles burned into the picture while it is in picture-in-picture', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'picture-in-picture can only be opened by a test in Chromium');
    await playWithSubtitle(page, 'pgssub', 'dvdsub');
    const profiles: unknown[] = [];
    page.on('request', (request) => {
      if (!/\/PlaybackInfo/.test(request.url()) || request.method() !== 'POST') return;
      profiles.push((request.postDataJSON() as { DeviceProfile: { SubtitleProfiles: unknown[] } }).DeviceProfile.SubtitleProfiles);
    });
    await showControls(page);
    await page.getByRole('button', { name: 'Subtitles' }).click();
    await expect(page.getByText('These subtitles are pictures, so their size and colour are fixed.')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Exit picture-in-picture' })).toBeVisible();
    // The stream is asked for again with no subtitle formats on offer, so the server burns them in.
    await expect.poll(() => profiles.at(-1)).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expectPlaying(page);

    // Back in the page, they are drawn here again.
    await showControls(page);
    await page.getByRole('button', { name: 'Exit picture-in-picture' }).click();
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
    expect(profiles.at(-1)).not.toEqual([]);
    await expectPlaying(page);
  });

  test('transcodes on request and keeps playing', async ({ page, browserName }) => {
    const [movie] = await items(page, '/Items', { includeItemTypes: 'Movie', recursive: 'true', sortBy: 'SortName', limit: '1' });
    test.skip(!movie, 'the server has no movies');
    const hlsRequests = watchForHls(page);
    await page.goto(`/item/${movie.Id}`);
    await page
      .getByRole('button', { name: 'Play from beginning' })
      .or(page.getByRole('button', { name: 'Play', exact: true }))
      .first()
      .click();
    await expectPlaying(page);
    await showControls(page);
    // A file that plays as it is does not need hls.js, so it has not been fetched.
    const direct = await page.getByText('Direct Play', { exact: true }).isVisible();
    if (direct) expect(hlsRequests).toHaveLength(0);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: '2 Mbps 480p' }).click();
    await expect(page.getByText('Transcode', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expectPlaying(page);
    // The transcode comes as HLS. Safari plays that by itself; elsewhere hls.js has now been fetched, once.
    expect(hlsRequests).toHaveLength(browserName === 'webkit' ? 0 : 1);
    // Back to the original quality for whoever uses this browser profile next.
    await showControls(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Original / Auto' }).click();
  });

  test('holds the sound back by the audio delay, also for a transcode', async ({ page, browserName }) => {
    const [movie] = await items(page, '/Items', { includeItemTypes: 'Movie', recursive: 'true', sortBy: 'SortName', limit: '1' });
    test.skip(!movie, 'the server has no movies');
    const hlsRequests = watchForHls(page);
    await page.goto(`/item/${movie.Id}`);
    await page
      .getByRole('button', { name: 'Play from beginning' })
      .or(page.getByRole('button', { name: 'Play', exact: true }))
      .first()
      .click();
    await expectPlaying(page);
    await showControls(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: '2 Mbps 480p' }).click();
    await expect(page.getByText('Transcode', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expectPlaying(page);

    await showControls(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'More audio delay' }).click();
    await expect(page.getByTestId('audio-delay')).toHaveText('+25 ms');
    // Safari's own HLS player can't delay its sound, so the stream moves to hls.js there.
    if (browserName === 'webkit') await expect.poll(() => hlsRequests.length, { timeout: 30_000 }).toBe(1);
    await expectPlaying(page);
    await expect(page.getByText('Audio delay isn’t available in this browser.')).toHaveCount(0);

    // Back to the original quality for whoever uses this browser profile next (the menu is still open).
    await page.getByRole('button', { name: 'Original / Auto' }).click();
  });

  test('a library can be filtered, jumped through by letter and shown as a list', async ({ page }) => {
    const [library] = (await items(page, '/UserViews', {})).filter(
      (v) => (v as Item & { CollectionType?: string }).CollectionType === 'movies',
    );
    test.skip(!library, 'the server has no movie library');
    await page.goto(`/library/${library.Id}?tab=library`);
    const count = page.getByText(/^[\d,.\s]+ items?$/);
    await expect(count).toBeVisible();
    const all = await count.textContent();

    // A letter moves the list to it; the list stays whole, so the count does not change.
    const [firstS] = await items(page, '/Items', {
      parentId: library.Id,
      recursive: 'true',
      includeItemTypes: 'Movie',
      sortBy: 'SortName',
      nameStartsWith: 'S',
      limit: '1',
    });
    const [lastBeforeS] = await items(page, '/Items', {
      parentId: library.Id,
      recursive: 'true',
      includeItemTypes: 'Movie',
      sortBy: 'SortName',
      sortOrder: 'Descending',
      nameLessThan: 'S',
      limit: '1',
    });
    test.skip(!firstS || !lastBeforeS, 'the library has no movie under S, or none before it');
    const bar = page.getByTestId('alphabet-bar');
    await bar.getByRole('button', { name: 'S', exact: true }).click();
    await expect(page).toHaveURL(/letter=S/);
    await expect(page.getByLabel(firstS.Name, { exact: true }).first()).toBeInViewport();
    await expect(count).toHaveText(all!);
    // The titles before it are loaded above when asked for, and the bar stays in reach.
    await page.getByRole('button', { name: 'Earlier titles' }).click();
    await expect(page.getByLabel(lastBeforeS.Name, { exact: true }).first()).toBeAttached();
    await expect(page.getByLabel(firstS.Name, { exact: true }).first()).toBeInViewport();
    await expect(bar).toBeInViewport();
    await bar.getByRole('button', { name: 'S', exact: true }).click();
    await expect(page).not.toHaveURL(/letter=/);

    // Two years together match more than the first alone.
    await page.getByRole('button', { name: 'Year', exact: true }).click();
    const years = page.getByRole('menuitemcheckbox');
    await years.nth(0).click();
    await expect(page).toHaveURL(/year=\d{4}/);
    await expect(count).not.toHaveText(all!);
    const one = await count.textContent();
    await years.nth(1).click();
    await expect(page).toHaveURL(/year=\d{4}&year=\d{4}/);
    await expect(count).not.toHaveText(one!);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '2 years' })).toBeVisible();

    await page.getByRole('button', { name: 'List view' }).click();
    await expect(page.getByTestId('item-list').getByRole('listitem').first()).toBeVisible();
    await page.getByRole('button', { name: 'Grid view' }).click();
  });

  test("shows a song's lyrics in time with it, and jumps to a line", async ({ page }) => {
    const songs = await items(page, '/Items', { includeItemTypes: 'Audio', recursive: 'true', sortBy: 'SortName', limit: '50' });
    const withLyrics = await page.evaluate(
      async (ids) => {
        const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string };
        for (const id of ids) {
          const res = await fetch(`${s.serverUrl}/Audio/${id}/Lyrics`, {
            headers: {
              Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${s.accessToken}"`,
            },
          });
          if (res.ok && ((await res.json()) as { Lyrics?: { Start?: number }[] }).Lyrics?.some((l) => typeof l.Start === 'number'))
            return id;
        }
        return null;
      },
      songs.map((song) => song.Id),
    );
    test.skip(!withLyrics, 'no song with timed lyrics in the first 50');
    const song = songs.find((x) => x.Id === withLyrics)!;
    await page.goto(`/item/${song.Id}`);
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: 'Lyrics' }).click();
    const lyrics = page.getByTestId('lyrics');
    await expect(lyrics).toBeVisible();
    // The line being sung is marked, and moves on with the song.
    const current = lyrics.locator('[aria-current="true"]');
    await expect(current).toBeVisible({ timeout: 15_000 });
    const first = await current.textContent();
    await expect(current).not.toHaveText(first!, { timeout: 15_000 });
    // Clicking a line plays from there.
    const lines = lyrics.locator('button[data-line]');
    await lines.last().click();
    await expect(current).toHaveText((await lines.last().textContent())!);
    await page.getByRole('button', { name: 'Close player' }).click();
  });

  test("downloads a season's episodes one after the other", async ({ page }) => {
    const [season] = await items(page, '/Items', { includeItemTypes: 'Season', recursive: 'true', sortBy: 'SortName', limit: '1' });
    test.skip(!season, 'the server has no seasons');
    await page.goto(`/item/${season.Id}`);
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: 'Download all…' }).click();
    const list = page.getByTestId('download-list').getByRole('listitem');
    await expect(list.first()).toBeVisible();
    const count = await list.count();
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await page.getByRole('button', { name: /^Download \d+ files?$/ }).click();
    await expect(page.getByText('All downloads started.', { exact: false })).toBeVisible({ timeout: 10_000 + count * 2000 });
    await expect.poll(() => downloads.length).toBe(count);
    expect(downloads.every((name) => /\.\w+$/.test(name))).toBe(true);
  });

  test("an administrator edits an episode's skippable segments", async ({ page }) => {
    const [episode] = await items(page, '/Items', { includeItemTypes: 'Episode', recursive: 'true', sortBy: 'SortName', limit: '1' });
    test.skip(!episode, 'the server has no episodes');
    await page.goto(`/item/${episode.Id}`);
    const more = page.getByRole('button', { name: 'More' }).first();
    await more.click();
    const edit = page.getByRole('menuitem', { name: 'Edit metadata' });
    test.skip(!(await edit.isVisible()), 'the test account is not an administrator');
    await edit.click();
    await page.getByRole('tab', { name: 'Segments' }).click();
    const tab = page.getByTestId('segments-tab');
    await expect(tab).toBeVisible();
    if (await tab.getByText('install the Intro Skipper plugin').isVisible()) {
      // Without the plugin they can only be looked at.
      await expect(tab.getByRole('button', { name: 'Add a segment' })).toHaveCount(0);
      return;
    }
    // Start from none, add an intro, save, and find it on the server.
    while ((await tab.getByRole('button', { name: 'Remove segment' }).count()) > 0)
      await tab.getByRole('button', { name: 'Remove segment' }).first().click();
    await tab.getByRole('button', { name: 'Add a segment' }).click();
    await tab.getByLabel('Start').fill('0:01');
    await tab.getByLabel('End').fill('0:00');
    await expect(tab.getByText('The end has to come after the start.')).toBeVisible();
    await expect(tab.getByRole('button', { name: 'Save' })).toBeDisabled();
    await tab.getByLabel('End').fill('0:05.5');
    await tab.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Segments saved')).toBeVisible();
    const onServer = () =>
      page.evaluate(async (id) => {
        const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string };
        const res = await fetch(`${s.serverUrl}/MediaSegments/${id}`, {
          headers: {
            Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${s.accessToken}"`,
          },
        });
        return ((await res.json()) as { Items: { Type: string; StartTicks: number; EndTicks: number }[] }).Items;
      }, episode.Id);
    expect(await onServer()).toEqual([expect.objectContaining({ Type: 'Intro', StartTicks: 10_000_000, EndTicks: 55_000_000 })]);
    // And back to none.
    await page.getByText('Segments saved').waitFor({ state: 'hidden' });
    await tab.getByRole('button', { name: 'Remove segment' }).click();
    await tab.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Segments saved')).toBeVisible();
    expect(await onServer()).toEqual([]);
  });

  test('the Live TV guide schedules and cancels recordings, of a programme and of a series', async ({ page }) => {
    test.setTimeout(90_000);
    // Start without recordings left from an earlier run.
    await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string };
      const headers = {
        Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${s.accessToken}"`,
      };
      for (const kind of ['SeriesTimers', 'Timers']) {
        const res = await fetch(`${s.serverUrl}/LiveTv/${kind}`, { headers });
        if (!res.ok) continue;
        for (const timer of ((await res.json()) as { Items: { Id: string }[] }).Items) {
          await fetch(`${s.serverUrl}/LiveTv/${kind}/${timer.Id}`, { method: 'DELETE', headers });
        }
      }
    });
    const views = await items(page, '/UserViews', {});
    const liveTv = views.find((v) => (v as Item & { CollectionType?: string }).CollectionType === 'livetv');
    test.skip(!liveTv, 'the server has no Live TV');
    await page.goto(`/library/${liveTv!.Id}?tab=guide`);
    const guide = page.getByTestId('livetv-guide');
    const cells = guide.getByRole('gridcell');
    await expect(cells.first()).toBeVisible();
    // A programme later on: it can be recorded, but not watched yet.
    const later = cells.nth(2);
    const name = (await later.getAttribute('title'))!;
    await later.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Watch now' })).toHaveCount(0);
    const record = dialog.getByRole('button', { name: 'Record', exact: true });
    // The buttons come once the programme's details are in.
    await record.waitFor({ timeout: 10_000 }).catch(() => {});
    test.skip(!(await record.isVisible()), 'the test account may not record');
    await record.click();
    await expect(dialog.getByRole('button', { name: 'Cancel recording' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(later.getByLabel('Will be recorded')).toBeVisible();

    // It is in the list of what will be recorded, and can be called off from there.
    await page.getByRole('button', { name: 'Recordings' }).click();
    const scheduled = page.getByTestId('livetv-scheduled');
    await expect(scheduled.getByText(name).first()).toBeVisible();
    await scheduled
      .getByRole('button', { name: `Cancel recording ${name}` })
      .first()
      .click();
    await expect(scheduled).toBeHidden();

    // A series: every airing.
    await page.getByRole('button', { name: 'Guide' }).click();
    await expect(cells.first()).toBeVisible();
    const episode = cells.filter({ hasText: 'Test Series' }).nth(1);
    test.skip((await episode.count()) === 0, 'the guide has no series');
    await episode.click();
    await dialog.getByRole('button', { name: 'Record series…' }).click();
    // Which airings, and how many to keep.
    const series = page.getByTestId('series-recording');
    // Whatever the server's defaults are.
    const newOnly = series.getByRole('switch', { name: 'New episodes only' });
    if ((await newOnly.getAttribute('aria-checked')) !== 'true') await newOnly.click();
    await series.getByLabel('Keep').selectOption({ label: 'The latest 5 recordings' });
    await page.getByRole('dialog').getByRole('button', { name: 'Record series' }).click();
    await expect(page.getByText('Every airing will be recorded')).toBeVisible();
    // Back in the programme, which says so.
    await expect(dialog.getByText('The series is being recorded')).toBeVisible();
    await page.keyboard.press('Escape');

    // It is listed with what was chosen, and can be changed and called off there.
    await page.getByRole('button', { name: 'Recordings' }).click();
    const recurring = page.getByTestId('livetv-scheduled');
    await expect(recurring.getByText('New episodes only')).toBeVisible();
    await recurring
      .getByRole('button', { name: /^Settings for recording / })
      .first()
      .click();
    await expect(series.getByRole('switch', { name: 'New episodes only' })).toHaveAttribute('aria-checked', 'true');
    await expect(series.getByLabel('Keep')).toHaveValue('5');
    await series.getByLabel('Start early').selectOption('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Series recording saved')).toBeVisible();
    const saved = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string };
      const res = await fetch(`${s.serverUrl}/LiveTv/SeriesTimers`, {
        headers: {
          Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${s.accessToken}"`,
        },
      });
      return ((await res.json()) as { Items: { RecordNewOnly: boolean; KeepUpTo: number; PrePaddingSeconds: number }[] }).Items;
    });
    expect(saved).toEqual([expect.objectContaining({ RecordNewOnly: true, KeepUpTo: 5, PrePaddingSeconds: 120 })]);
    await recurring
      .getByRole('button', { name: /^Stop recording / })
      .first()
      .click();
    await expect(recurring).toBeHidden();
  });

  test('the Live TV guide tunes to what is on', async ({ page }) => {
    const views = await items(page, '/UserViews', {});
    const liveTv = views.find((v) => (v as Item & { CollectionType?: string }).CollectionType === 'livetv');
    test.skip(!liveTv, 'the server has no Live TV');
    await page.goto(`/library/${liveTv!.Id}?tab=guide`);
    await page.getByTestId('livetv-guide').getByRole('gridcell').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Watch now' }).click();
    await expectPlaying(page);
    await showControls(page);
    await page.getByRole('button', { name: 'Stop playback' }).click();
  });

  test('Your stats counts what was played, not what was marked as watched', async ({ page }) => {
    const films = await items(page, '/Items', { includeItemTypes: 'Movie', recursive: 'true', sortBy: 'SortName', limit: '2' });
    test.skip(films.length < 2, 'the server needs two films');
    const [played, marked] = films;
    // From no playtime at all (other tests may have left some on this account).
    await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string; userId: string };
      const headers = {
        Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${s.accessToken}"`,
        'Content-Type': 'application/json',
      };
      const prefs = `${s.serverUrl}/DisplayPreferences/jellyfied-playtime?userId=${s.userId}&client=jellyfied`;
      const dto = await (await fetch(prefs, { headers })).json();
      await fetch(prefs, { method: 'POST', headers, body: JSON.stringify({ ...dto, CustomPrefs: {} }) });
      localStorage.removeItem(`jellyfied.playtime.pending.${s.userId}`);
    });
    // Marked as watched without playing a second of it.
    await page.evaluate(async (id) => {
      const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string; userId: string };
      await fetch(`${s.serverUrl}/UserPlayedItems/${id}?userId=${s.userId}`, {
        method: 'POST',
        headers: {
          Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${s.accessToken}"`,
        },
      });
    }, marked.Id);
    await page.goto('/stats');
    await expect(page.getByRole('heading', { name: 'Your stats' })).toBeVisible();
    const before = (await page.locator('main').textContent()) ?? '';

    // A few seconds of the other one, played for real.
    await page.goto(`/play/${played.Id}`);
    await expectPlaying(page);
    await expect.poll(() => time(page), { timeout: 30_000 }).toBeGreaterThan(6);
    await showControls(page);
    await page.getByRole('button', { name: 'Stop playback' }).click();

    await page.goto('/stats');
    const watched = page.getByText('Time watched').locator('..');
    await expect(watched).toContainText(/\d+ sec|\d+ min/);
    expect(before).not.toContain(marked.Name);
    // Neither film was played through: the marked one doesn't count as watched.
    await expect(page.getByText('Films watched').locator('..')).toHaveText(/^0\s*Films watched$/);
    await page.screenshot({ path: test.info().outputPath('stats.png') });
  });

  test('preferences are stored with the account on the server', async ({ page }) => {
    const stored = () =>
      page.evaluate(async () => {
        const session = JSON.parse(localStorage.getItem('jellyfied.session')!) as {
          serverUrl: string;
          accessToken: string;
          userId: string;
        };
        const res = await fetch(`${session.serverUrl}/DisplayPreferences/usersettings?userId=${session.userId}&client=jellyfied`, {
          headers: {
            Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e", Version="1", Token="${session.accessToken}"`,
          },
        });
        return ((await res.json()) as { CustomPrefs?: Record<string, string> }).CustomPrefs?.['jellyfied.seekSteps'] ?? null;
      });

    await page.goto('/settings');
    await page.getByLabel('Skip forward').selectOption('60');
    await expect.poll(async () => JSON.parse((await stored()) ?? '{}').forward, { timeout: 15_000 }).toBe(60);
    await page.getByLabel('Skip forward').selectOption('30');
    await expect.poll(async () => JSON.parse((await stored()) ?? '{}').forward, { timeout: 15_000 }).toBe(30);

    // A browser that has never been used takes the value from the account.
    await page.getByLabel('Skip forward').selectOption('90');
    await expect.poll(async () => JSON.parse((await stored()) ?? '{}').forward, { timeout: 15_000 }).toBe(90);
    await page.evaluate(() => localStorage.removeItem('jellyfied.seekSteps'));
    await page.reload();
    await expect(page.getByLabel('Skip forward')).toHaveValue('90');
    await page.getByLabel('Skip forward').selectOption('30');
    await expect.poll(async () => JSON.parse((await stored()) ?? '{}').forward, { timeout: 15_000 }).toBe(30);
  });
});
