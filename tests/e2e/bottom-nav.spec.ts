import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';

// Bottom navigator (web/PWA narrow + Capacitor mobile). The default project
// viewport is 1280×800 (sidebar mode), so these tests run at a phone width to
// exercise the bottom-nav shell.

/** Reset + sign in, then neutralize the Next.js dev-tools overlay (dev only). */
async function startOnMobile(page: Page): Promise<void> {
  await resetAppState(page);
  await loginAsAdmin(page);
  // The Next.js dev-tools button (bottom-left; dev only — absent in production
  // builds) overlaps the leftmost bottom-nav link and intercepts clicks. Injected
  // after the full-page navigation above, so the style survives (a reload would
  // drop it) and taps reach the nav beneath the overlay.
  await page.addStyleTag({
    content: 'nextjs-portal, [data-nextjs-dev-overlay] { pointer-events: none !important; }',
  });
}

test.describe('bottom navigator (mobile viewport)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('replaces the sidebar and header at a narrow web viewport', async ({ page }) => {
    await startOnMobile(page);

    await expect(page.getByTestId('bottom-nav')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav')).toHaveCount(0);
    // header controls are gone on the bottom-nav layout
    await expect(page.getByTestId('user-menu')).toHaveCount(0);
    await expect(page.getByTestId('page-title')).toHaveText('Dashboard');
  });

  test('navigates between sections via the bottom tabs', async ({ page }) => {
    await startOnMobile(page);

    await page.getByTestId('nav-/settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByTestId('page-title')).toHaveText('Settings');

    await page.getByTestId('nav-/dashboard').click();
    await expect(page.getByTestId('dashboard')).toBeVisible();
  });

  test('profile tab opens the sheet with theme toggle and sign out', async ({ page }) => {
    await startOnMobile(page);

    await page.getByTestId('profile-tab').click();
    await expect(page.getByTestId('profile-sheet')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toBeVisible();
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('profile-logout')).toBeVisible();

    await page.getByTestId('profile-logout').click();
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });
  });
});
