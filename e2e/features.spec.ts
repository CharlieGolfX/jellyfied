import { expect, test, type Page } from '@playwright/test';
import { mockJellyfin, signIn, USER } from './mockJellyfin';

/** Library tools, the home page layout, the account PIN and the newer dashboard pages, against the mocked server. */

test.describe('a large library', () => {
  test.beforeEach(async ({ page }) => {
    await mockJellyfin(page, { big: true });
    await signIn(page);
    await expect(page.getByText('Recently Added in Movies')).toBeVisible();
    await page.goto('/library/lib-movies?tab=library');
    await expect(page.getByText('260 items')).toBeVisible();
  });

  const card = (page: Page, name: string) => page.getByLabel(name, { exact: true });
  /** Whether one card sits in a row above another. */
  const isAbove = async (page: Page, upper: string, lower: string) => {
    const [a, b] = await Promise.all([card(page, upper).boundingBox(), card(page, lower).boundingBox()]);
    return Boolean(a && b && a.y + a.height <= b.y);
  };

  test('a letter moves the list there and keeps the rest of it', async ({ page }) => {
    await expect(card(page, 'A film 01')).toBeVisible();
    await page.getByTestId('alphabet-bar').getByRole('button', { name: 'N', exact: true }).click();
    await expect(page).toHaveURL(/letter=N/);
    await expect(card(page, 'N film 01')).toBeInViewport();
    // Still the whole library, not only the titles under N.
    await expect(page.getByText('260 items')).toBeVisible();
    await expect(card(page, 'O film 01')).toBeAttached();

    // The titles before the letter are loaded above it, without moving what is on screen.
    await expect(card(page, 'M film 10')).toBeAttached();
    await expect(card(page, 'N film 01')).toBeInViewport({ ratio: 1 });
    await expect.poll(() => isAbove(page, 'L film 10', 'N film 01')).toBe(true);
    // Rows are whole, as in the full list: the 130 titles before N fill their rows, and N follows on.
    const { columns, before } = await page.evaluate(() => {
      const grid = document.querySelector('#main-scroll .grid')!;
      const cards = [...grid.children].map((el) => ({ el, box: el.getBoundingClientRect() }));
      const m = cards.find((c) => c.el.querySelector('[aria-label="N film 01"]'))!;
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        before: cards.filter((c) => Math.abs(c.box.top - m.box.top) < 2 && c.box.left < m.box.left).length,
      };
    });
    expect(before).toBe(130 % columns);
    // The bar is still there to pick another letter, and the letter's row is right under it.
    const bar = page.getByTestId('alphabet-bar');
    await expect(bar).toBeInViewport({ ratio: 1 });
    const gap = (await card(page, 'N film 01').boundingBox())!.y - (await bar.boundingBox())!.y - (await bar.boundingBox())!.height;
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(80);

    // The same letter again goes back to the start.
    await page.getByTestId('alphabet-bar').getByRole('button', { name: 'N', exact: true }).click();
    await expect(page).not.toHaveURL(/letter=/);
    await expect(card(page, 'A film 01')).toBeInViewport();
  });

  test('a letter also works in a list sorted from Z to A', async ({ page }) => {
    await page.goto('/library/lib-movies?tab=library&order=Descending');
    await expect(card(page, 'Z film 10')).toBeVisible();
    await page.getByTestId('alphabet-bar').getByRole('button', { name: 'C', exact: true }).click();
    await expect(card(page, 'C film 10')).toBeInViewport({ ratio: 1 });
    await expect(card(page, 'D film 01')).toBeAttached();
    await expect.poll(() => isAbove(page, 'E film 01', 'C film 10')).toBe(true);
  });

  test('a filter takes several values', async ({ page }) => {
    await page.getByRole('button', { name: 'Year', exact: true }).click();
    const menu = page.getByRole('menu');
    await menu.getByRole('menuitemcheckbox', { name: '2000' }).click();
    const both = page.waitForRequest((r) => new URL(r.url()).searchParams.get('years') === '2000,2001');
    // The menu stays open for the second one.
    await menu.getByRole('menuitemcheckbox', { name: '2001' }).click();
    await both;
    await expect(page).toHaveURL(/year=2000&year=2001/);
    await expect(page.getByText('174 items')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '2 years' })).toBeVisible();

    await page.getByRole('button', { name: 'Genre', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Drama' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Drama' })).toBeVisible();
    await expect(page.getByText('87 items')).toBeVisible();

    // The address holds the filters, so they survive a reload.
    await page.reload();
    await expect(page.getByText('87 items')).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('260 items')).toBeVisible();
  });

  test('shift-click selects everything in between', async ({ page }) => {
    await page.getByRole('button', { name: 'List view' }).click();
    await page.getByRole('checkbox', { name: 'Select A film 02' }).click();
    await page.getByRole('checkbox', { name: 'Select A film 06' }).click({ modifiers: ['Shift'] });
    const bar = page.getByTestId('bulk-bar');
    await expect(bar).toContainText('5 selected');
    await expect(page.getByRole('checkbox', { name: 'Select A film 04' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select A film 07' })).not.toBeChecked();

    // Upwards as well, from the item ticked last without shift.
    await page.getByRole('checkbox', { name: 'Select A film 01' }).click({ modifiers: ['Shift'] });
    await expect(bar).toContainText('6 selected');
  });
});

test('home rows can be dragged into another order', async ({ page }) => {
  await mockJellyfin(page, { big: true });
  await signIn(page);
  const headings = page.getByRole('heading', { name: /^Recently Added in/ });
  await expect(headings).toHaveText(['Recently Added in Movies', 'Recently Added in Shows']);

  await page.getByRole('button', { name: 'Customise home' }).click();
  const rows = page.getByTestId('home-row-setting').filter({ hasText: 'Recently Added in' });
  await expect(rows).toHaveText([/Movies/, /Shows/]);
  const from = (await rows.nth(0).getByTestId('home-row-handle').boundingBox())!;
  const to = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height - 2, { steps: 6 });
  await page.mouse.up();
  await expect(rows.nth(0)).toContainText('Shows');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(headings).toHaveText(['Recently Added in Shows', 'Recently Added in Movies']);

  await page.reload();
  await expect(headings).toHaveText(['Recently Added in Shows', 'Recently Added in Movies']);
});

test('the login screen shows the server’s disclaimer as plain text', async ({ page }) => {
  await mockJellyfin(page);
  await page.goto('/');
  await expect(page.getByTestId('login-disclaimer')).toHaveText('Private server. Be kind.');
});

test('the interface language can be chosen from the languages there is text for', async ({ page }) => {
  await mockJellyfin(page);
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/settings');
  const language = page.getByLabel('Interface language');
  await expect(language.getByRole('option')).toHaveText(['Same as the browser (English)', 'English']);
  await language.selectOption('en');
  expect(await page.evaluate(() => localStorage.getItem('jellyplex.language'))).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('an account can be protected with a PIN that is asked for when switching to it', async ({ page }) => {
  await mockJellyfin(page);
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();

  await page.goto('/settings');
  const form = page.getByTestId('account-pin');
  await form.getByLabel(/^PIN/).fill('4821');
  await form.getByLabel('Repeat the PIN').fill('4821');
  await form.getByRole('button', { name: 'Set PIN' }).click();
  await expect(page.getByText('PIN set')).toBeVisible();
  await expect(form.getByLabel('Current PIN')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('jellyplex.pins'))).not.toContain('4821');

  // A second account signs in on this browser and becomes the current one.
  await page.evaluate(() => {
    const demo = JSON.parse(localStorage.getItem('jellyplex.session')!);
    const guest = { ...demo, userId: 'user-2', userName: 'guest' };
    localStorage.setItem('jellyplex.session', JSON.stringify(guest));
    localStorage.setItem('jellyplex.accounts', JSON.stringify([guest, demo]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByText(`Switch to ${USER.name}`).click();

  const prompt = page.getByTestId('pin-prompt');
  await prompt.getByLabel('PIN').fill('0000');
  await prompt.getByRole('button', { name: 'Switch' }).click();
  await expect(prompt).toContainText('Wrong PIN. 4 tries left.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jellyplex.session')!).userName)).toBe('guest');

  await prompt.getByLabel('PIN').fill('4821');
  await prompt.getByRole('button', { name: 'Switch' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jellyplex.session')!).userName)).toBe(USER.name);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
});

test.describe('the server dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockJellyfin(page, { admin: true });
    await signIn(page);
    await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  });

  const posted = (page: Page, path: string) =>
    page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(path));

  test('lists backups, makes one and asks before restoring', async ({ page }) => {
    await page.goto('/admin/backups');
    const backup = page.getByTestId('backup');
    await expect(backup).toContainText('jellyfin-backup-20261001030000.zip');
    await expect(backup).toContainText('Metadata');

    await page.getByRole('button', { name: 'Create backup' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: 'Subtitles' }).check();
    const created = posted(page, '/Backup/Create');
    await dialog.getByRole('button', { name: 'Create backup' }).click();
    expect((await created).postDataJSON()).toEqual({ Database: true, Metadata: false, Subtitles: true, Trickplay: false });
    await expect(page.getByText('Backup created')).toBeVisible();

    await backup.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('dialog')).toContainText('The server restarts');
    const restored = posted(page, '/Backup/Restore');
    await page.getByRole('button', { name: 'Restore and restart' }).click();
    expect((await restored).postDataJSON()).toEqual({ ArchiveFileName: 'jellyfin-backup-20261001030000.zip' });
  });

  test('sets a user’s parental controls', async ({ page }) => {
    await page.goto('/admin/users/user-1');
    await page.getByRole('button', { name: 'parental' }).click();
    // Ratings of different countries with the same age are one level.
    await page.getByLabel('Highest allowed rating').selectOption({ label: 'PG-13 / FSK-12' });
    await page.getByRole('checkbox', { name: 'Movies' }).check();
    await page.getByLabel('Hide items with any of these tags').fill('horror, gore');
    await page.getByRole('button', { name: 'Add a time' }).click();
    const schedule = page.getByTestId('access-schedule');
    await schedule.getByLabel('Days').selectOption('Weekend');
    await schedule.getByLabel('To', { exact: true }).selectOption({ label: '21:30' });

    const saved = posted(page, '/Users/user-1/Policy');
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await saved).postDataJSON()).toMatchObject({
      MaxParentalRating: 13,
      BlockUnratedItems: ['Movie'],
      BlockedTags: ['horror', 'gore'],
      AccessSchedules: [{ DayOfWeek: 'Weekend', StartHour: 8, EndHour: 21.5 }],
    });
  });

  test('saves branding, metadata settings and plugin repositories', async ({ page }) => {
    await page.goto('/admin/branding');
    await page.getByLabel('Login disclaimer').fill('Members only.');
    let saved = posted(page, '/System/Configuration/Branding');
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await saved).postDataJSON()).toMatchObject({ LoginDisclaimer: 'Members only.' });

    await page.getByRole('link', { name: 'Metadata' }).click();
    await expect(page.getByRole('heading', { name: 'Trickplay' })).toBeVisible();
    await page.getByLabel('Widths (pixels)').fill('320, 480');
    await page.getByLabel('For new items, use').selectOption('scan');
    const config = posted(page, '/System/Configuration');
    const metadata = posted(page, '/System/Configuration/metadata');
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await config).postDataJSON()).toMatchObject({ ServerName: 'Mock Server', TrickplayOptions: { WidthResolutions: [320, 480] } });
    expect((await metadata).postDataJSON()).toEqual({ UseFileCreationTimeForDateAdded: false });

    await page.getByRole('link', { name: 'Plugins' }).click();
    await page.getByRole('button', { name: 'repositories' }).click();
    await expect(page.getByTestId('repository')).toHaveCount(1);
    await page.getByRole('button', { name: 'Add repository' }).click();
    const added = page.getByTestId('repository').nth(1);
    await expect(page.getByRole('button', { name: 'Save repositories' })).toBeDisabled();
    await added.getByLabel('Name').fill('Extras');
    await added.getByLabel('Address of its manifest').fill('https://example.org/manifest.json');
    saved = posted(page, '/Repositories');
    await page.getByRole('button', { name: 'Save repositories' }).click();
    expect((await saved).postDataJSON()).toEqual([
      { Name: 'Jellyfin Stable', Url: 'https://repo.jellyfin.org/files/plugin/manifest.json', Enabled: true },
      { Name: 'Extras', Url: 'https://example.org/manifest.json', Enabled: true },
    ]);
  });
});
