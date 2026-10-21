import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockJellyfin, signIn } from './mockJellyfin';

/** Automated accessibility checks (axe, WCAG 2.1 A and AA) on the main pages, against the mocked server. */

// The rules look at the page's markup and styles, which are the same in every browser.
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  // One line per problem and element, so a failure says what to fix and where.
  return results.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id} (${v.impact}): ${n.html.slice(0, 160)} – ${n.failureSummary?.split('\n').slice(1).join(' ').trim() || v.help}`,
    ),
  );
}

test.beforeEach(async ({ page }) => {
  await mockJellyfin(page);
});

test('the sign-in page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('Recently Added in Movies')).toBeVisible();
  });

  test('the home page', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });

  test('a library', async ({ page }) => {
    await page.goto('/library/lib-movies?tab=library');
    await expect(page.getByLabel('The Mock Movie', { exact: true }).first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("an item's page", async ({ page }) => {
    await page.goto('/item/movie-1');
    await expect(page.getByRole('heading', { name: 'The Mock Movie' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('the player', async ({ page }) => {
    await page.goto('/play/movie-1');
    await expect(page.getByRole('button', { name: /Back \d+ seconds/ })).toBeAttached();
    expect(await violations(page)).toEqual([]);
  });

  test('account settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
