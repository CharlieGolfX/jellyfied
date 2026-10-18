// Takes the README screenshots (docs/screenshots) from a running Jellyfied and a real library.
//
//   npm run build && npm run preview -- --port 4173 &
//   SHOT_USERNAME=me SHOT_PASSWORD=secret node scripts/screenshots.mjs
//
// SHOT_BASE_URL   Jellyfied to photograph (default http://localhost:4173)
// SHOT_JELLYFIN   Jellyfin address for the browser (default http://localhost:8096); leave empty
//                 when the instance already knows its server, as the container does
// SHOT_MOVIE, SHOT_SHOW   titles to use for the detail pages and the player (default: the first found)
// SHOT_USERNAME2, SHOT_PASSWORD2   a second user, for the SyncPlay picker (skipped without one)
// SHOT_ONLY       comma-separated file names to retake (e.g. syncplay-picker.jpg), default all
import { chromium } from '@playwright/test';

const baseURL = process.env.SHOT_BASE_URL ?? 'http://localhost:4173';
const jellyfin = process.env.SHOT_JELLYFIN ?? 'http://localhost:8096';
const out = new URL('../docs/screenshots/', import.meta.url).pathname;

const only = process.env.SHOT_ONLY?.split(',').map((n) => n.trim());
/** Whether one of these pictures is to be taken in this run. */
const want = (...names) => !only || names.some((n) => only.includes(n));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

/** A signed-in page in a browser context of its own. */
async function signedIn(username, password) {
  const page = await browser.newPage({ baseURL, viewport: { width: 1600, height: 900 } });
  if (jellyfin) {
    await page.route('**/config.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.JELLYFIED_CONFIG = ${JSON.stringify({ serverUrl: jellyfin, lockServer: true })};`,
      }),
    );
  }
  await page.goto('/');
  const manual = page.getByRole('button', { name: /manual/i });
  await page.getByLabel('Username').or(manual).first().waitFor();
  if (!(await page.getByLabel('Username').isVisible())) await manual.click();
  await page.getByLabel('Username').fill(username ?? '');
  await page.getByLabel('Password').fill(password ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Account menu' }).waitFor();
  return page;
}

const page = await signedIn(process.env.SHOT_USERNAME, process.env.SHOT_PASSWORD);

/** Asks the server with the signed-in session. */
const api = (path, query = {}) =>
  page.evaluate(
    async (request) => {
      const s = JSON.parse(localStorage.getItem('jellyfied.session'));
      const res = await fetch(`${s.serverUrl}${request.path}?${new URLSearchParams({ userId: s.userId, ...request.query })}`, {
        headers: {
          Authorization: `MediaBrowser Client="Jellyfied", Device="screenshots", DeviceId="screenshots", Version="1", Token="${s.accessToken}"`,
        },
      });
      return res.json();
    },
    { path, query },
  );

/** Waits until the images on screen have loaded and the fade-ins are over. */
async function settle(extra = 900) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(extra);
}
async function shot(name, on = page) {
  await settle();
  await on.screenshot({
    path: `${out}${name}`,
    type: name.endsWith('.png') ? 'png' : 'jpeg',
    ...(name.endsWith('.png') ? {} : { quality: 88 }),
  });
  console.log('wrote', name);
}

const views = (await api('/UserViews')).Items;
const movies = views.find((v) => v.CollectionType === 'movies');
const find = async (type, title) =>
  (
    await api('/Items', {
      includeItemTypes: type,
      recursive: 'true',
      limit: '1',
      sortBy: 'SortName',
      ...(title ? { searchTerm: title } : {}),
    })
  ).Items[0];
const movie = await find('Movie', process.env.SHOT_MOVIE);
const show = await find('Series', process.env.SHOT_SHOW);

if (want('home.jpg')) {
  await page.goto('/');
  await page
    .getByTestId('featured-banner')
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await shot('home.jpg');
}

if (movies && want('movies-recommended.jpg', 'movies-library.jpg', 'library-list.jpg')) {
  await page.goto(`/library/${movies.Id}`);
  await shot('movies-recommended.jpg');

  await page.goto(`/library/${movies.Id}?tab=library`);
  await shot('movies-library.jpg');

  await page.getByRole('button', { name: 'List view' }).click();
  await settle(400);
  const boxes = page.getByRole('checkbox');
  for (const i of [1, 2, 4]) await boxes.nth(i).click();
  await shot('library-list.jpg');
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByRole('button', { name: 'Grid view' }).click();
}

if (movie && want('movie-details.jpg')) {
  await page.goto(`/item/${movie.Id}`);
  await shot('movie-details.jpg');
}
if (show && want('show-details.jpg')) {
  await page.goto(`/item/${show.Id}`);
  await shot('show-details.jpg');
}

if (want('account-settings.png')) {
  await page.goto('/settings');
  await shot('account-settings.png');
}

/** Starts the movie from its page and waits until a frame from well inside it is showing. */
async function playMovie() {
  await page.goto(`/item/${movie.Id}`);
  await page
    .getByRole('button', { name: 'Play from beginning' })
    .or(page.getByRole('button', { name: 'Play', exact: true }))
    .first()
    .click();
  const video = page.getByTestId('video');
  await video.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid=video]')?.currentTime > 1, null, { timeout: 60_000 });
  // A frame from well inside the film, with the controls and a menu showing.
  await video.evaluate((v) => {
    v.currentTime = Math.min(v.duration * 0.31, 2400);
  });
  await page.waitForFunction(
    () => {
      const v = document.querySelector('[data-testid=video]');
      return !v.seeking && v.readyState >= 3;
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(2500);
  return video;
}

if (movie && want('player.jpg')) {
  const video = await playMovie();
  await video.evaluate((v) => v.pause());
  await page.mouse.move(700, 500);
  await page.mouse.move(720, 520);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}player.jpg`, type: 'jpeg', quality: 88 });
  console.log('wrote player.jpg');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Stop playback' }).click();
}

if (movie && want('mini-player.jpg', 'server-status.jpg')) {
  // Back out of the playing video to its page: it carries on in the mini player.
  await playMovie();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Expand player' }).waitFor();
  await page.mouse.move(1450, 760);
  if (want('mini-player.jpg')) await shot('mini-player.jpg');
  if (want('server-status.jpg')) {
    // Shows the video above as playing on the server.
    await page.getByRole('button', { name: 'Server status' }).click();
    await page
      .getByText('Nothing is playing right now.')
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => {});
    await shot('server-status.jpg');
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Stop playback' }).click();
}

if (want('syncplay-picker.jpg') && process.env.SHOT_USERNAME2) {
  // Two members of a group, each suggesting films and voting for one of the other's.
  const other = await signedIn(process.env.SHOT_USERNAME2, process.env.SHOT_PASSWORD2);
  await page.goto('/');
  await page.getByRole('button', { name: 'SyncPlay' }).click();
  await page.getByRole('button', { name: 'Create a group' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForTimeout(2000);
  await other.getByRole('button', { name: 'SyncPlay' }).click();
  await other
    .getByRole('button', { name: new RegExp(`${process.env.SHOT_USERNAME}'s group`) })
    .first()
    .click();
  await other.waitForTimeout(2000);

  const films = (await api('/Items', { includeItemTypes: 'Movie', recursive: 'true', limit: '4', sortBy: 'Random' })).Items;
  const pickers = [];
  for (const [i, member] of [page, other].entries()) {
    // The SyncPlay menu stays open after creating or joining a group.
    const pick = member.getByRole('button', { name: 'Pick what to watch' });
    if (!(await pick.isVisible())) await member.getByRole('button', { name: 'SyncPlay' }).click();
    await pick.click();
    const dialog = member.getByRole('dialog', { name: 'What shall we watch?' });
    for (const film of films.slice(i * 2, i * 2 + 2)) {
      await dialog.getByRole('searchbox', { name: 'Suggest something' }).fill(film.Name);
      await dialog
        .getByRole('button', { name: new RegExp(film.Name) })
        .first()
        .click();
      await dialog.getByTestId('picker-suggestion').filter({ hasText: film.Name }).waitFor();
    }
    await dialog.getByRole('searchbox', { name: 'Suggest something' }).fill('');
    pickers.push(dialog);
  }
  // Each votes for the other's first suggestion; the other member is ready, this one not yet.
  for (const [i, dialog] of pickers.entries()) {
    const film = films[i === 0 ? 2 : 0];
    const entry = dialog.getByTestId('picker-suggestion').filter({ hasText: film.Name });
    await entry.waitFor({ timeout: 15_000 });
    await entry.getByRole('button', { name: 'Vote for this' }).click();
  }
  await pickers[1].getByRole('button', { name: 'I’m ready' }).click();
  await page.waitForTimeout(3000);
  await shot('syncplay-picker.jpg');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'SyncPlay' }).click();
  await page.getByRole('button', { name: 'Delete group' }).click();
  await page.getByRole('dialog', { name: 'Delete this group?' }).getByRole('button', { name: 'Delete group' }).click();
  await other.close();
}

await browser.close();
