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
  await expect(page.getByText(`Jellyplex ${pkg.version}`)).toBeVisible();
  await page.getByText('Sign out').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
