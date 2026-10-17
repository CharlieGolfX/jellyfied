import { expect, test } from '@playwright/test';
import pkg from '../package.json' with { type: 'json' };
import { mockJellyfin, signIn, USER } from './mockJellyfin';

test.beforeEach(async ({ page }) => {
  await mockJellyfin(page);
});

test('sends a visitor to the login screen, which names the server and the version', async ({ page }) => {
  await page.goto('/library/lib-movies');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Mock Server · Jellyfin 10.11.0')).toBeVisible();
  await expect(page.getByText(`v${pkg.version}`)).toBeVisible();
});

test('refuses a wrong password', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username').fill(USER.name);
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid username or password.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('signs in and shows the home page', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Movies', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await expect(page.getByText('The Mock Movie').first()).toBeVisible();
});

test('browses from a library to a movie', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Movies', exact: true }).first().click();
  await expect(page).toHaveURL(/\/library\/lib-movies/);
  // A card has two links to its item: the poster (covered by the play button on hover) and the title.
  await page.getByRole('link', { name: 'The Mock Movie' }).nth(1).click();
  await expect(page).toHaveURL(/\/item\/movie-1$/);
  await expect(page.getByRole('heading', { name: 'The Mock Movie' })).toBeVisible();
  await expect(page.getByText('A film that exists only in this test.')).toBeVisible();
});

test('stays signed in after a reload', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
});

test('shows a not-found page for an unknown address', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/no-such-page');
  await expect(page.getByText(/not found/i).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Movies', exact: true }).first()).toBeVisible();
});

test('a page that crashes leaves the rest of the app working', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/item/movie-broken');
  await expect(page.getByTestId('crash-state')).toBeVisible();
  await expect(page.getByText('Something went wrong')).toBeVisible();

  // The shell around the page is still there, and going elsewhere clears the error.
  await page.getByRole('link', { name: 'Movies', exact: true }).first().click();
  await expect(page).toHaveURL(/\/library\/lib-movies/);
  await expect(page.getByTestId('crash-state')).toHaveCount(0);
  await expect(page.getByText('The Mock Movie').first()).toBeVisible();
});

test('shows the version in the account menu and signs out', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText(`Jellyfied ${pkg.version}`)).toBeVisible();
  await page.getByText('Sign out').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('the player uses the chosen skip lengths and lists its keyboard shortcuts', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/settings');
  await page.getByLabel('Skip back').selectOption('5');
  await page.getByLabel('Skip forward').selectOption('60');

  await page.goto('/play/movie-1');
  await expect(page.getByText('No playable media source was found.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back 5 seconds' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Forward 60 seconds' })).toBeAttached();

  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await expect(help.getByText('Back 5 seconds')).toBeVisible();
  await expect(help.getByText('Forward 60 seconds')).toBeVisible();

  // Escape closes the list first; the player stays open.
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(page).toHaveURL(/\/play\/movie-1$/);
});

test("the player's title opens its page and keeps playing in the mini player", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/play/movie-1');
  // The mock server has no playable media, so the error panel covers the bars: click the title directly.
  await page.getByRole('button', { name: 'The Mock Movie', exact: true }).dispatchEvent('click');
  await expect(page).toHaveURL(/\/item\/movie-1$/);
  await expect(page.getByRole('button', { name: 'Expand' })).toBeVisible();
});

test('names the browser tab after the page', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveTitle('Home · Jellyfied');
  await page.goto('/item/movie-1');
  await expect(page).toHaveTitle('The Mock Movie · Jellyfied');
});

test('a library can be jumped through by letter, shown as a list, and changed in bulk', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/library/lib-movies?tab=library');

  const byLetter = page.waitForRequest((r) => r.url().includes('nameLessThan=M'));
  await page.getByTestId('alphabet-bar').getByRole('button', { name: 'M', exact: true }).click();
  await byLetter;

  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByTestId('item-list').getByRole('link', { name: 'The Mock Movie' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Select The Mock Movie' }).click();
  const bar = page.getByTestId('bulk-bar');
  await expect(bar).toContainText('1 selected');
  const marked = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/UserPlayedItems/movie-1'));
  await bar.getByRole('button', { name: 'Watched', exact: true }).click();
  await marked;
  await expect(page.getByText('1 item marked as watched')).toBeVisible();
  await expect(bar).toBeHidden();
});

test('rows of the home page can be hidden, and stay hidden', async ({ page }) => {
  await signIn(page);
  const row = page.getByRole('heading', { name: 'Recently Added in Movies' });
  await expect(row).toBeVisible();

  await page.getByRole('button', { name: 'Customise home' }).click();
  await page.getByRole('switch', { name: 'Recently Added in Movies' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(row).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Customise home' })).toBeVisible();
  await expect(row).toBeHidden();
});

test('an account stays signed in while another one is added, and can be continued without a password', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByText('Add another account').click();

  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: `Continue as ${USER.name}` }).click();
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
});

test('preferences are taken from the account and changes are sent back to it', async ({ page }) => {
  let saved: { CustomPrefs?: Record<string, string> } | null = null;
  await page.route('**/jellyfin/DisplayPreferences/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { Id: 'prefs', CustomPrefs: { 'jellyfied.seekSteps': '{"back":5,"forward":90}', chromecastVersion: 'stable' } },
      });
    } else {
      saved = route.request().postDataJSON() as typeof saved;
      await route.fulfill({ status: 204 });
    }
  });
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByLabel('Skip back')).toHaveValue('5');
  await expect(page.getByLabel('Skip forward')).toHaveValue('90');

  await page.getByLabel('Skip forward').selectOption('60');
  await expect.poll(() => saved?.CustomPrefs?.['jellyfied.seekSteps']).toBe('{"back":5,"forward":60}');
  // What other apps keep in the same place is passed back untouched.
  expect(saved!.CustomPrefs!.chromecastVersion).toBe('stable');
});

test('the login screen links to the licences of Jellyfied and what it ships with', async ({ page, request }) => {
  await mockJellyfin(page);
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Licences' });
  await expect(link).toHaveAttribute('href', /licenses\.txt$/);
  const text = await (await request.get('/licenses.txt')).text();
  expect(text).toContain('GNU GENERAL PUBLIC LICENSE');
  expect(text).toContain('hls.js');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // iOS zooms in on a field with smaller text when it is tapped, and the app stays zoomed in after.
  test('text fields are large enough that tapping them does not zoom the page', async ({ browserName, page }) => {
    test.skip(browserName === 'firefox', 'Firefox has no phone emulation');
    const fontSizes = () =>
      page
        .locator('input:not([type=checkbox]):not([type=radio]):not([type=range])')
        .evaluateAll((fields) => fields.map((f) => parseFloat(getComputedStyle(f).fontSize)));
    await page.goto('/');
    await expect(page.getByLabel('Username')).toBeVisible();
    for (const size of await fontSizes()) expect(size).toBeGreaterThanOrEqual(16);

    await signIn(page);
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible();
    for (const size of await fontSizes()) expect(size).toBeGreaterThanOrEqual(16);
  });
});
