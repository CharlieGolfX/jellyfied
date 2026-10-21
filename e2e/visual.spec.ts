import { expect, test, type Page } from '@playwright/test';
import { mockJellyfin, signIn } from './mockJellyfin';

/**
 * Screenshots of the player's controls, compared with the reference pictures next to this file,
 * since the player is the most intricate part of the interface. Text renders a little differently
 * on every system, so the pictures are made and compared in Playwright's Linux container only:
 * `npm run test:visual` (and `test:visual:update` after an intended change). CI does the same.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');
test.skip(!process.env.E2E_VISUAL, 'run with npm run test:visual');

test.use({ viewport: { width: 1280, height: 720 } });

/** Opens the player on the eight-second sample, paused at the start with the controls showing. */
async function openPausedPlayer(page: Page) {
  // A fixed time of day, for "Ends at".
  await page.clock.setFixedTime(new Date('2026-01-15T20:00:00'));
  await mockJellyfin(page, { playable: true });
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/play/movie-1');
  const video = page.locator('video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.pause();
    v.currentTime = 0;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  });
  await page.mouse.move(640, 360);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}

// The picture itself is hidden (it fills the player, so a mask would cover the controls too): only
// the controls over it are compared.
const options = { stylePath: new URL('./fixtures/hide-video.css', import.meta.url).pathname, animations: 'disabled' as const };

test('the full-screen player, paused', async ({ page }) => {
  await openPausedPlayer(page);
  await expect(page).toHaveScreenshot('player-paused.png', options);
});

test('the settings menu', async ({ page }) => {
  await openPausedPlayer(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Audio delay')).toBeVisible();
  await expect(page).toHaveScreenshot('player-settings.png', options);
});

test('the mini player', async ({ page }) => {
  await openPausedPlayer(page);
  await page.getByRole('button', { name: 'Minimize player' }).click();
  const mini = page.getByTestId('video').locator('..');
  await expect.poll(async () => (await mini.boundingBox())?.width ?? 0).toBeLessThan(500);
  // Hovered, so its controls show.
  const box = (await mini.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: 'Expand player' })).toBeVisible();
  await expect(mini).toHaveScreenshot('player-mini.png', options);
});
