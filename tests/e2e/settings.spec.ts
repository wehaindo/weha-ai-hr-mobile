import { expect, test } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';

test.describe('settings', () => {
  test('creates a new user who can then sign in', async ({ page }) => {
    await resetAppState(page);
    await loginAsAdmin(page);

    await page.getByTestId('nav-/settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await page.getByTestId('tab-users').click();

    await page.getByTestId('add-user').click();
    await page.getByTestId('user-name-input').fill('Cashier One');
    await page.getByTestId('user-pin-input').fill('654321');
    await page.getByTestId('user-pin-confirm-input').fill('654321');
    await page.getByTestId('save-user').click();

    await expect(page.getByTestId('user-row-cashier-one')).toBeVisible();

    // New user can sign in
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.getByTestId('user-cashier-one').click();
    await page.keyboard.type('654321');
    await page.getByTestId('pin-submit').click();
    await page.waitForSelector('[data-testid="dashboard"]');
    await expect(page.getByTestId('user-menu')).toContainText('Cashier One');
  });

  test('theme preset applies and persists across reloads', async ({ page }) => {
    await resetAppState(page);
    await loginAsAdmin(page);

    await page.getByTestId('nav-/settings').click();
    await page.getByTestId('tab-appearance').click();
    await expect(page.getByTestId('appearance-settings')).toBeVisible();

    await page.getByTestId('preset-ocean').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  });

  test('sync monitor shows activation flow', async ({ page }) => {
    await resetAppState(page);
    await loginAsAdmin(page);

    await page.getByTestId('nav-/sync').click();
    await expect(page.getByTestId('sync-page')).toBeVisible();
    await expect(page.getByTestId('activation-token')).toBeVisible();
    await expect(page.getByTestId('activate-button')).toBeDisabled();
  });

  test('users without settings permission cannot open settings', async ({ page }) => {
    await resetAppState(page);
    await loginAsAdmin(page);

    // operator only has app.use — create one, then log in as them
    await page.getByTestId('nav-/settings').click();
    await page.getByTestId('tab-users').click();
    await page.getByTestId('add-user').click();
    await page.getByTestId('user-name-input').fill('Plain Operator');
    await page.getByTestId('user-role-select').click();
    await page.getByRole('option', { name: 'Operator' }).click();
    await page.getByTestId('user-pin-input').fill('111111');
    await page.getByTestId('user-pin-confirm-input').fill('111111');
    await page.getByTestId('save-user').click();
    await expect(page.getByTestId('user-row-plain-operator')).toBeVisible();

    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.getByTestId('user-plain-operator').click();
    await page.keyboard.type('111111');
    await page.getByTestId('pin-submit').click();
    await page.waitForSelector('[data-testid="dashboard"]');

    // Settings hidden from sidebar and route is gated
    await expect(page.getByTestId('nav-/settings')).toHaveCount(0);
    await page.goto('/settings/users');
    await expect(page.getByText('Access denied')).toBeVisible();
  });
});
