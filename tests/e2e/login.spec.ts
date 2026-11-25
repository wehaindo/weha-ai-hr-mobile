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

  test('pin mode offers the on-page switch links to the other enabled types', async ({ page }) => {
    await resetAppState(page);

    await expect(page.getByTestId('user-grid')).toBeVisible();
    // With NEXT_PUBLIC_LOGIN_METHOD=all (forced for e2e), pin mode shows both
    // on-page toggle links (HRD-mobile style method picker).
    await expect(page.getByTestId('toggle-password-login')).toBeVisible();
    await expect(page.getByTestId('toggle-mobile-login')).toBeVisible();
  });

  test('signs in with username and password', async ({ page }) => {
    await resetAppState(page);

    await page.getByTestId('toggle-password-login').click();
    await expect(page.getByTestId('password-login-form')).toBeVisible();
    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('admin123');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('page-title')).toHaveText('Dashboard');
  });
});
