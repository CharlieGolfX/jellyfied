// Takes the README screenshots (docs/screenshots) from a running Jellyfied and a real library.
//
//   npm run build && npm run preview -- --port 4173 &
//   SHOT_USERNAME=me SHOT_PASSWORD=secret node scripts/screenshots.mjs
//
// SHOT_BASE_URL   Jellyfied to photograph (default http://localhost:4173)
// SHOT_JELLYFIN   Jellyfin address for the browser (default http://localhost:8096); leave empty
//                 when the instance already knows its server, as the container does
// SHOT_MOVIE, SHOT_SHOW   titles to use for the detail pages and the player (default: the first found)
import { chromium } from '@playwright/test';

const baseURL = process.env.SHOT_BASE_URL ?? 'http://localhost:4173';
const jellyfin = process.env.SHOT_JELLYFIN ?? 'http://localhost:8096';
const out = new URL('../docs/screenshots/', import.meta.url).pathname;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
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
await page.getByLabel('Username').fill(process.env.SHOT_USERNAME ?? '');
await page.getByLabel('Password').fill(process.env.SHOT_PASSWORD ?? '');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('button', { name: 'Account menu' }).waitFor();

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
async function shot(name) {
  await settle();
  await page.screenshot({
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

await page.goto('/');
await page
  .getByTestId('featured-banner')
  .waitFor({ timeout: 15_000 })
  .catch(() => {});
await shot('home.jpg');

if (movies) {
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

if (movie) {
  await page.goto(`/item/${movie.Id}`);
  await shot('movie-details.jpg');
}
if (show) {
  await page.goto(`/item/${show.Id}`);
  await shot('show-details.jpg');
}

await page.goto('/settings');
await shot('account-settings.png');

if (movie) {
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

await browser.close();
