import { expect, test, type Page } from '@playwright/test';
import { inviteName } from '../src/player/syncplayInviteList';
import { mockJellyfin, signIn } from './mockJellyfin';

/** Invite-only SyncPlay groups, against the mocked server. The signed-in user is demo (user-1). */

const anna = { Id: 'user-2', Name: 'anna', HasPassword: true, Policy: { IsAdministrator: false } };
const ben = { Id: 'user-3', Name: 'ben', HasPassword: true, Policy: { IsAdministrator: false } };

async function serverUsers(page: Page) {
  await page.route('**/jellyfin/Users?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ Id: 'user-1', Name: 'demo' }, anna, ben]) }),
  );
}

async function groups(page: Page, list: { GroupId: string; GroupName: string; Participants: string[] }[]) {
  await page.route('**/jellyfin/SyncPlay/List', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(list.map((g) => ({ State: 'Idle', ...g }))) }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockJellyfin(page);
  await serverUsers(page);
});

test('the creator picks who an invite-only group is for', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'SyncPlay' }).click();
  await page.getByRole('button', { name: 'Create a group' }).click();
  await page.getByRole('radio', { name: 'Only people I invite' }).click();

  const create = page.getByRole('button', { name: 'Create', exact: true });
  await expect(create).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'demo' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'anna' }).click();

  const created = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/SyncPlay/New'));
  await create.click();
  expect((await created).postDataJSON()).toEqual({ GroupName: inviteName("demo's group", 'user-1', ['user-2']) });
});

test('a group for everyone is still created with one choice', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'SyncPlay' }).click();
  await page.getByRole('button', { name: 'Create a group' }).click();
  await expect(page.getByRole('radio', { name: 'Everyone on the server' })).toBeChecked();
  const created = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/SyncPlay/New'));
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  expect((await created).postDataJSON()).toEqual({ GroupName: "demo's group" });
});

test.describe('an invited user', () => {
  test.beforeEach(async ({ page }) => {
    await groups(page, [
      { GroupId: 'invited', GroupName: inviteName("anna's group", 'user-2', ['user-1']), Participants: ['anna'] },
      { GroupId: 'not-invited', GroupName: inviteName("ben's group", 'user-3', ['user-2']), Participants: ['ben'] },
      { GroupId: 'open', GroupName: 'Movie night', Participants: ['ben'] },
    ]);
    await signIn(page);
  });

  test('is asked to join, and joins', async ({ page }) => {
    const popup = page.getByRole('dialog', { name: 'anna invited you to watch together' });
    await expect(popup).toBeVisible();
    await expect(popup.getByText("anna's group")).toBeVisible();
    const joined = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/SyncPlay/Join'));
    await popup.getByRole('button', { name: 'Join' }).click();
    expect((await joined).postDataJSON()).toEqual({ GroupId: 'invited' });
    await expect(popup).toHaveCount(0);
  });

  test('the question never covers the top bar’s menus', async ({ page }) => {
    await expect(page.getByRole('dialog', { name: 'anna invited you to watch together' })).toBeVisible();
    await page.getByRole('button', { name: 'SyncPlay' }).click();
    await page.getByRole('button', { name: 'Create a group' }).click();
    await page.getByRole('radio', { name: 'Only people I invite' }).click();
    await page.getByRole('checkbox', { name: 'anna' }).click();
    await expect(page.getByRole('checkbox', { name: 'anna' })).toBeChecked();
  });

  test('can decline, is not asked again, and still finds the group in the menu', async ({ page }) => {
    const popup = page.getByRole('dialog', { name: 'anna invited you to watch together' });
    await popup.getByRole('button', { name: 'Decline' }).click();
    await expect(popup).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Recently Added in Movies')).toBeVisible();

    await page.getByRole('button', { name: 'SyncPlay' }).click();
    const menu = page.getByTestId('syncplay-menu');
    await expect(menu.getByTestId('syncplay-group')).toHaveCount(2);
    await expect(menu.getByText("anna's group")).toBeVisible();
    await expect(menu.getByText('Movie night')).toBeVisible();
    await expect(menu.getByText("ben's group")).toHaveCount(0);
    await expect(popup).toHaveCount(0);
  });
});
