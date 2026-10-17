import { expect, test } from '@playwright/test';
import { mockJellyfin, signIn } from './mockJellyfin';

/** Search, settings, the server dashboard and the metadata editor, against the mocked server. */

test.describe('as a regular user', () => {
  test.beforeEach(async ({ page }) => {
    await mockJellyfin(page);
    await signIn(page);
    await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  });

  test('search suggests titles while typing and has a results page', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search' });
    await search.fill('mock');
    await expect(page.getByRole('link', { name: /The Mock Movie/ }).first()).toBeVisible();

    await search.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=mock$/);
    await expect(page.getByRole('heading', { name: /Results for/ })).toContainText('mock');
    await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible();
    await expect(page).toHaveTitle('“mock” · Jellyfied');
  });

  test('"/" jumps to the search box', async ({ page }) => {
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeFocused();
  });

  test('playback preferences are saved to the account', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
    await page.getByRole('switch', { name: 'Automatically play the next episode' }).click();

    const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/Users/Configuration'));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).postDataJSON()).toMatchObject({ EnableNextEpisodeAutoPlay: false });
    await expect(page.getByText('Preferences saved')).toBeVisible();
  });

  test('the time display setting applies right away and survives a reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Default time display').selectOption('12h');
    await expect(page.getByText('Time display updated')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Default time display')).toHaveValue('12h');
  });

  test('the server dashboard is closed to regular users', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Server status' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText('Server dashboard')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/admin');
    await expect(page.getByText('Administrator access required')).toBeVisible();
  });

  test('a regular user is not offered the metadata editor', async ({ page }) => {
    await page.goto('/item/movie-1');
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByText('Add to favorites').or(page.getByText('Add to playlist')).first()).toBeVisible();
    await expect(page.getByText('Edit metadata')).toHaveCount(0);
  });
});

test.describe('as an administrator', () => {
  test.beforeEach(async ({ page }) => {
    await mockJellyfin(page, { admin: true });
    await signIn(page);
    await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  });

  test('the dashboard opens from the account menu and lists the users', async ({ page }) => {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByText('Server dashboard').click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page).toHaveTitle('Server dashboard · Jellyfied');
    await expect(page.getByText('Mock Server').first()).toBeVisible();

    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('main').getByText('demo').first()).toBeVisible();
  });

  test('the server status menu shows what is playing, scanning and can be updated', async ({ page }) => {
    await page.route('**/Sessions?*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            Id: 'session-1',
            UserName: 'demo',
            DeviceName: 'Living room',
            NowPlayingItem: { Id: 'movie-1', Name: 'The Mock Movie', Type: 'Movie', ProductionYear: 2020, RunTimeTicks: 60e8 },
            PlayState: { PositionTicks: 15e8, PlayMethod: 'DirectPlay' },
          },
        ]),
      }),
    );
    await page.route('**/ScheduledTasks?*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          { Id: 'task-1', Key: 'RefreshLibrary', Name: 'Scan Media Library', State: 'Running', CurrentProgressPercentage: 42 },
        ]),
      }),
    );
    await page.reload();

    const button = page.getByRole('button', { name: 'Server status' });
    await expect(button).toContainText('1');
    await button.click();
    const panel = page.getByRole('dialog', { name: 'Server status' });
    await expect(panel.getByText('Now Playing (1)')).toBeVisible();
    await expect(panel.getByRole('link', { name: /The Mock Movie/ })).toBeVisible();
    await expect(panel.getByText('Scanning libraries')).toBeVisible();
    await expect(panel.getByText('42%')).toBeVisible();
    await expect(panel.getByRole('link', { name: /Jellyfin 10\.11\.5 is available/ })).toBeVisible();
    await expect(panel.getByRole('link', { name: /Jellyfied 99\.0\.0 is available/ })).toBeVisible();

    await panel.getByRole('link', { name: 'Server dashboard' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(panel).toHaveCount(0);
  });

  test('general settings load from the server and are saved back', async ({ page }) => {
    await page.goto('/admin/general');
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
    const name = page.getByLabel('Server name');
    await expect(name).toHaveValue('Mock Server');
    await name.fill('Renamed Server');
    // Only the languages the server has text for, not every language it knows of.
    await expect(page.getByLabel('Display language (server UI)').getByRole('option')).toHaveText(['Deutsch', 'English']);

    const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/System/Configuration'));
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await saved).postDataJSON()).toMatchObject({ ServerName: 'Renamed Server' });
  });

  test('metadata can be edited from an item’s menu', async ({ page }) => {
    await page.goto('/item/movie-1');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByText('Edit metadata').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Edit metadata: The Mock Movie');

    const title = dialog.getByLabel('Title', { exact: true });
    await expect(title).toHaveValue('The Mock Movie');
    await title.fill('The Renamed Movie');
    const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/Items/movie-1'));
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).postDataJSON()).toMatchObject({ Name: 'The Renamed Movie', Id: 'movie-1' });
    await expect(page.getByText('Metadata saved')).toBeVisible();
    await expect(dialog).toBeHidden();
  });
});
