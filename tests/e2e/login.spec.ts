import { expect, test } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';

test.describe('login', () => {
  test('shows the seeded admin and signs in with the default PIN', async ({ page }) => {
    await resetAppState(page);

    await expect(page.getByTestId('user-grid')).toBeVisible();
    await expect(page.getByTestId('user-administrator')).toBeVisible();

    await loginAsAdmin(page);
    await expect(page.getByTestId('dashboard')).toBeVisible();
    await expect(page.getByTestId('page-title')).toHaveText('Dashboard');
    await expect(page.getByTestId('sidebar-nav')).toBeVisible();
  });

  test('rejects a wrong PIN', async ({ page }) => {
    await resetAppState(page);

    await page.getByTestId('user-administrator').click();
    await page.waitForSelector('[data-testid="pin-dialog"]');
    await page.keyboard.type('9999');
    await page.getByTestId('pin-submit').click();

    await expect(page.getByTestId('pin-error')).toBeVisible();
    await expect(page.getByTestId('pin-dialog')).toBeVisible();
  });

  test('logout returns to the login screen', async ({ page }) => {
    await resetAppState(page);
    await loginAsAdmin(page);

    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();

    await expect(page.getByTestId('user-grid')).toBeVisible();
  });
});
