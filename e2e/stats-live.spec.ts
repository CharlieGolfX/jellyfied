import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Your stats, compared between three people on a real server, through Jellyfied's container.
 * Skipped unless three accounts are given (`node e2e/server/setup.mjs up` makes a server with them):
 *
 *   E2E_USERNAME, E2E_FRIEND_USERNAME, E2E_THIRD_USERNAME (and their passwords)
 *   E2E_BASE_URL   a Jellyfied container that proxies that server
 *
 * Each account's playtime is written straight to the server (as hours of watching would leave
 * it), then each one opens Your stats and chooses to compare.
 */
const accounts = [
  { name: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD ?? '' },
  { name: process.env.E2E_FRIEND_USERNAME, password: process.env.E2E_FRIEND_PASSWORD ?? '' },
  { name: process.env.E2E_THIRD_USERNAME, password: process.env.E2E_THIRD_PASSWORD ?? '' },
];

test.skip(
  accounts.some((a) => !a.name),
  'set E2E_USERNAME, E2E_FRIEND_USERNAME and E2E_THIRD_USERNAME (and passwords) to run',
);

async function signedIn(browser: Browser, account: { name?: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  const manual = page.getByRole('button', { name: /manual/i });
  await expect(page.getByLabel('Username').or(manual).first()).toBeVisible();
  if (!(await page.getByLabel('Username').isVisible())) await manual.click();
  await page.getByLabel('Username').fill(account.name!);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  return page;
}

/** Writes an account's playtime: `hours` of the first film today, and stops comparing if it did. */
function seed(page: Page, hours: number) {
  return page.evaluate(async (played) => {
    const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { serverUrl: string; accessToken: string; userId: string };
    const headers = {
      Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e-stats", Version="1", Token="${s.accessToken}"`,
      'Content-Type': 'application/json',
    };
    const q = new URLSearchParams({ userId: s.userId, includeItemTypes: 'Movie', recursive: 'true', sortBy: 'SortName', limit: '1' });
    const film = ((await (await fetch(`${s.serverUrl}/Items?${q}`, { headers })).json()) as { Items: { Id: string }[] }).Items[0];
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const playtime = { version: 2, since: today, days: { [today]: { v: played * 3600, a: 0, i: { [film.Id]: [played * 3600, 1] } } } };
    const prefs = `${s.serverUrl}/DisplayPreferences/jellyfied-playtime?userId=${s.userId}&client=jellyfied`;
    const dto = await (await fetch(prefs, { headers })).json();
    await fetch(prefs, { method: 'POST', headers, body: JSON.stringify({ ...dto, CustomPrefs: { playtime: JSON.stringify(playtime) } }) });
    await fetch('/jellyfied-api/stats', { method: 'DELETE', headers });
  }, hours);
}

test('people who choose to compare are told how they compare, and nothing about the others', async ({ browser }) => {
  test.setTimeout(120_000);
  const pages = await Promise.all(accounts.map((a) => signedIn(browser, a)));
  try {
    await Promise.all(pages.map((page, i) => seed(page, [5, 2, 1][i])));

    // One by one they choose to take part; until the third, there is nothing to compare.
    for (const [i, page] of pages.entries()) {
      await page.goto('/stats?range=7d');
      await expect(page.getByText('Time watched').locator('..')).toContainText(`${[5, 2, 1][i]} hr`);
      await page.getByRole('button', { name: 'Compare with others' }).click();
      await expect(page.getByText("You're taking part in comparisons")).toBeVisible();
      if (i < 2) await expect(page.getByText(/Comparisons appear once 3 people take part/)).toBeVisible();
    }

    // The one who watched most is told so; the numbers of the others appear nowhere.
    const first = pages[0];
    await first.reload();
    const said = first.getByTestId('comparisons');
    await expect(said).toContainText('You watched more than anyone else here');
    await expect(first.getByText('Among 3 people taking part.')).toBeVisible();
    const text = (await first.locator('main').textContent()) ?? '';
    expect(text).not.toContain(accounts[1].name!);
    expect(text).not.toContain('2 hr');

    // The middle one beat one of the two others.
    await pages[1].reload();
    await expect(pages[1].getByTestId('comparisons')).toContainText('You watched more than 50% of the others here');

    // Stopping takes one out: the others are back below three.
    await pages[2].getByRole('button', { name: 'Stop comparing' }).click();
    await expect(pages[2].getByRole('button', { name: 'Compare with others' })).toBeVisible();
    await first.reload();
    await expect(first.getByText(/2 do now/)).toBeVisible();
  } finally {
    // Out of the comparisons again, so the next run starts clean.
    for (const page of pages) {
      await page
        .evaluate(() => {
          const s = JSON.parse(localStorage.getItem('jellyfied.session')!) as { accessToken: string };
          return fetch('/jellyfied-api/stats', {
            method: 'DELETE',
            headers: {
              Authorization: `MediaBrowser Client="Jellyfied e2e", Device="e2e", DeviceId="e2e-stats", Version="1", Token="${s.accessToken}"`,
            },
          });
        })
        .catch(() => {});
    }
    await Promise.allSettled(pages.map((p) => p.context().close()));
  }
});
