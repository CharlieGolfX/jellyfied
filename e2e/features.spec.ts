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

    // The titles before the letter are not fetched until someone scrolls up towards them…
    await expect(page.getByTestId('earlier-titles')).toBeVisible();
    await expect(card(page, 'L film 10')).toHaveCount(0);
    // …and then they are added above, without moving what is on screen.
    // (A moment later, as a person would: the page's own scrolling to the letter does not count.)
    await page.waitForTimeout(400);
    await page.getByTestId('earlier-titles').hover();
    await page.mouse.wheel(0, -30);
    await expect(card(page, 'M film 10')).toBeAttached();
    await expect(card(page, 'N film 01')).toBeInViewport();
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
    // The tools are still there: another letter, or a filter, which keeps the place in the alphabet.
    await expect(page.getByRole('button', { name: 'Year', exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Year', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '2001' }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/letter=N.*year=2001|year=2001.*letter=N/);
    await expect(page.getByText('87 items')).toBeVisible();
    await expect(page.locator('#main-scroll .grid a[aria-label^="N film"]').first()).toBeInViewport();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('260 items')).toBeVisible();
    await expect(page.getByTestId('alphabet-bar')).toBeInViewport({ ratio: 1 });

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
    await page.getByRole('button', { name: 'Earlier titles' }).click();
    await expect(card(page, 'D film 01')).toBeAttached();
    await expect.poll(() => isAbove(page, 'E film 01', 'C film 10')).toBe(true);
  });

  test('only the rows near the screen are in the page, however long the list', async ({ page }) => {
    const grid = page.locator('#main-scroll .grid');
    await expect(grid).toHaveAttribute('data-total', '100');
    const mounted = () => grid.locator('a[aria-label]').count();
    expect(await mounted()).toBeLessThan(80);

    // Scrolling on loads the rest of the library; the page still only holds what is near the screen.
    for (let i = 0; i < 12 && (await grid.getAttribute('data-total')) !== '260'; i++) {
      await page.locator('#main-scroll').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await page.waitForTimeout(250);
    }
    await expect(grid).toHaveAttribute('data-total', '260');
    // The page only gets its full height once the last titles are laid out: scroll until the end is reached.
    await expect(async () => {
      await page.locator('#main-scroll').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect(card(page, 'Z film 10')).toBeInViewport({ timeout: 500 });
    }).toPass({ timeout: 10_000 });
    expect(await mounted()).toBeLessThan(80);
    await expect(card(page, 'A film 01')).toHaveCount(0);

    // And back at the top, the first rows are there again.
    await page.locator('#main-scroll').evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(card(page, 'A film 01')).toBeInViewport();
  });

  test('changing the poster size deep in a list keeps the place and leaves no empty screen', async ({ page }) => {
    const scroller = page.locator('#main-scroll');
    const grid = page.locator('#main-scroll .grid');
    // Load the whole library, then stand in the middle of it.
    for (let i = 0; i < 12 && (await grid.getAttribute('data-total')) !== '260'; i++) {
      await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await page.waitForTimeout(250);
    }
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight / 2 }));

    /** What the visible area holds: whether cards reach its top and bottom, and the first title that starts a row in it. */
    const view = () =>
      page.evaluate(() => {
        const scrollArea = document.getElementById('main-scroll')!;
        const area = scrollArea.getBoundingClientRect();
        const cards = [...document.querySelectorAll('#main-scroll .grid > *')].map((el) => ({ el, box: el.getBoundingClientRect() }));
        const visible = cards.filter((c) => c.box.bottom > area.top + 160 && c.box.top < area.bottom);
        return {
          cards: cards.length,
          above: Math.min(...cards.map((c) => c.box.top)) <= area.top + 160,
          // (At the very end of the list there is nothing below the last row.)
          below:
            Math.max(...cards.map((c) => c.box.bottom)) >= area.bottom - 1 ||
            scrollArea.scrollTop >= scrollArea.scrollHeight - scrollArea.clientHeight - 1,
          titles: visible.map((c) => c.el.querySelector('a[aria-label]')?.getAttribute('aria-label') ?? ''),
        };
      });
    await expect.poll(view).toMatchObject({ above: true, below: true });
    const place = (await view()).titles[0];

    const slider = page.getByRole('slider', { name: 'Poster size' });
    for (const size of ['1.8', '0.6', '1.3', '1']) {
      await slider.fill(size);
      await expect.poll(view, { message: `at size ${size}` }).toMatchObject({ above: true, below: true });
      // The title that was at the top of the screen is still on it.
      await expect.poll(async () => (await view()).titles, { message: `at size ${size}` }).toContain(place);
      // Still only the rows near the screen, whatever their size.
      expect((await view()).cards).toBeLessThan(260);
    }
  });

  test('going back returns to the same place in the list', async ({ page }) => {
    const scroller = page.locator('#main-scroll');
    await scroller.evaluate((el) => el.scrollTo({ top: 1400 }));
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(1400);
    // A card whose corner is on screen, so clicking it does not scroll the page first.
    const name = await page.evaluate(() => {
      const view = document.getElementById('main-scroll')!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('#main-scroll .grid a[aria-label]')];
      // Its top corner is below the bars that stick to the top, and well above the bottom edge.
      const inside = cards.find((a) => a.getBoundingClientRect().top > view.top + 120 && a.getBoundingClientRect().top < view.bottom - 80);
      return inside!.getAttribute('aria-label');
    });
    // The corner of the poster: its middle is the play button.
    await page.getByLabel(name!, { exact: true }).click({ position: { x: 6, y: 6 } });
    await expect(page).toHaveURL(/\/item\/film-/);

    await page.goBack();
    await expect(page).toHaveURL(/\/library\/lib-movies/);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(1400);
    await expect(page.getByLabel(name!, { exact: true })).toBeInViewport();
  });

  test('marking something watched shows at once, before the server has answered', async ({ page }) => {
    await page.getByRole('button', { name: 'List view' }).click();
    const row = page.getByTestId('item-list').getByRole('listitem').filter({ hasText: 'A film 03' });
    // A server that takes its time.
    await page.route('**/UserPlayedItems/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await row.getByRole('button', { name: 'Mark as watched' }).click();
    await expect(row.getByRole('button', { name: 'Mark as unwatched' })).toBeVisible({ timeout: 1000 });
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

test('a long row of search results is filled in as it is scrolled sideways', async ({ page }) => {
  await mockJellyfin(page, { big: true });
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/search?q=film');
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible();
  const row = page.locator('[data-hub-scroller]').first();
  const cards = row.locator('a[aria-label]');
  // 260 results, of which a first part is in the page.
  await expect(cards).toHaveCount(30);
  await expect(page.getByLabel('A film 01', { exact: true })).toBeVisible();

  // Scrolling to the end of what is there brings the next part, until all of them are.
  await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }));
  await expect(cards).toHaveCount(60);
  for (let i = 0; i < 12 && (await cards.count()) < 260; i++) {
    await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }));
    await page.waitForTimeout(150);
  }
  await expect(cards).toHaveCount(260);
  await expect(page.getByTestId('row-more')).toHaveCount(0);
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
  await expect(language.getByRole('option')).toHaveText(['Same as the browser (English)', 'English', /^Español/, 'Norsk bokmål']);
  await language.selectOption('en');
  expect(await page.evaluate(() => localStorage.getItem('jellyfied.language'))).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the logo takes the accent colour the user picks', async ({ page }) => {
  await mockJellyfin(page);
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  const logoColours = () =>
    page
      .getByRole('banner')
      .locator('svg stop')
      .evaluateAll((stops) => stops.map((s) => getComputedStyle(s).stopColor));
  const blue = await logoColours();
  expect(blue[1]).toBe('rgb(0, 164, 220)');

  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Red' }).click();
  const red = await logoColours();
  expect(red[1]).toBe('rgb(229, 72, 77)');
  // The light end is a tint of the same colour.
  expect(red[0]).not.toBe(blue[0]);
});

test('choosing another language reloads the interface in it, with its way of writing numbers', async ({ page }) => {
  await mockJellyfin(page, { big: true });
  await signIn(page);
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  await page.goto('/settings');

  await page.getByLabel('Interface language').selectOption('nb');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nb');
  await expect(page.getByRole('heading', { name: 'Kontoinnstillinger' })).toBeVisible();
  await expect(page.getByLabel('Grensesnittspråk').getByRole('option').first()).toHaveText('Samme som nettleseren (English)');
  await page.goto('/library/lib-movies?tab=library');
  await expect(page.getByText('260 elementer')).toBeVisible();

  await page.goto('/settings');
  await page.getByLabel('Grensesnittspråk').selectOption('es-ES');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES');
  await expect(page.getByRole('heading', { name: 'Ajustes de la cuenta' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Añadido recientemente en Movies')).toBeVisible();
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
  // Not stored as it was typed. (The digits alone may turn up inside the random salt or the hash.)
  expect(await page.evaluate(() => localStorage.getItem('jellyfied.pins'))).not.toContain('"4821"');

  // A second account signs in on this browser and becomes the current one.
  await page.evaluate(() => {
    const demo = JSON.parse(localStorage.getItem('jellyfied.session')!);
    const guest = { ...demo, userId: 'user-2', userName: 'guest', accessToken: 'guest-token' };
    localStorage.setItem('jellyfied.session', JSON.stringify(guest));
    localStorage.setItem('jellyfied.accounts', JSON.stringify([guest, ...JSON.parse(localStorage.getItem('jellyfied.accounts')!)]));
  });
  await page.goto('/');
  // With someone else using the browser, the protected account's sign-in is nowhere to be read.
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('mock-token');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByText(`Switch to ${USER.name}`).click();

  const prompt = page.getByTestId('pin-prompt');
  await prompt.getByLabel('PIN').fill('0000');
  await prompt.getByRole('button', { name: 'Switch' }).click();
  await expect(prompt).toContainText('Wrong PIN. 4 tries left.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jellyfied.session')!).userName)).toBe('guest');

  await prompt.getByLabel('PIN').fill('4821');
  await prompt.getByRole('button', { name: 'Switch' }).click();
  // Switching reloads the page, which can cut a look at its storage short: look again then.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jellyfied.session')!).userName).catch(() => null))
    .toBe(USER.name);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jellyfied.session')!).accessToken)).toBe('mock-token');
  await expect(page.getByText('Recently Added in Movies')).toBeVisible();
});

test.describe('a show', () => {
  test('going back returns the row of seasons to where it was scrolled to', async ({ page }) => {
    await mockJellyfin(page, { big: true });
    await signIn(page);
    await expect(page.getByText('Recently Added in Movies')).toBeVisible();
    await page.goto('/item/show-1');
    const row = page.locator('[data-hub-scroller]').filter({ has: page.getByLabel('Season 1', { exact: true }) });
    await expect(row.getByLabel('Season 12', { exact: true })).toBeAttached();
    await row.evaluate((el) => el.scrollTo({ left: 600, behavior: 'instant' }));
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(600);
    // A season whose card is on screen, opened without the row scrolling to it first.
    const name = await row.evaluate((el) => {
      const view = el.getBoundingClientRect();
      const cards = [...el.querySelectorAll<HTMLAnchorElement>('a[aria-label^="Season"]')];
      const inside = cards.find((a) => a.getBoundingClientRect().left > view.left + 40 && a.getBoundingClientRect().right < view.right);
      inside!.click();
      return inside!.getAttribute('aria-label');
    });
    await expect(page).toHaveURL(/\/item\/season-/);

    await page.goBack();
    await expect(page).toHaveURL(/\/item\/show-1/);
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(600);
    await expect(row.getByLabel(name!, { exact: true })).toBeInViewport();

    // Opened again as a new page, the row starts at the beginning.
    await page
      .getByRole('link', { name: 'Season 1', exact: true })
      .first()
      .evaluate((a) => (a as HTMLElement).click());
    await page.getByRole('link', { name: 'The Mock Show' }).click();
    await expect(page).toHaveURL(/\/item\/show-1/);
    await expect(row.getByLabel('Season 12', { exact: true })).toBeAttached();
    expect(await row.evaluate((el) => el.scrollLeft)).toBe(0);
  });
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
