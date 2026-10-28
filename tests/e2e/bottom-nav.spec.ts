import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';
import { mockRequestsApi } from './helpers/requests-mock';

// Bottom navigator (web/PWA narrow + Capacitor mobile). The default project
// viewport is 1280×800 (sidebar mode), so these tests run at a phone width to
// exercise the bottom-nav shell: primary tabs (nav.config `mobile: true`),
// the More sheet for everything else, and the Profile sheet.

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

    // primary tabs + More + Profile — no flood of ESS entries
    await expect(page.getByTestId('nav-/dashboard')).toBeVisible();
    await expect(page.getByTestId('nav-/leave')).toBeVisible();
    await expect(page.getByTestId('nav-/requests')).toBeVisible();
    // admin holds ess.approve → Approvals is promoted to a primary tab
    await expect(page.getByTestId('nav-/approvals')).toBeVisible();
    await expect(page.getByTestId('more-tab')).toBeVisible();
    await expect(page.getByTestId('profile-tab')).toBeVisible();
    // non-primary pages never render as direct tabs
    await expect(page.getByTestId('nav-/settings')).toHaveCount(0);
    await expect(page.getByTestId('nav-/attendance')).toHaveCount(0);
  });

  test('navigates via primary tabs and the More sheet', async ({ page }) => {
    await startOnMobile(page);

    await page.getByTestId('nav-/leave').click();
    await expect(page.getByTestId('page-title')).toHaveText('Leave');

    // More sheet holds the remaining permitted pages (admin sees Settings)
    await page.getByTestId('more-tab').click();
    await expect(page.getByTestId('more-sheet')).toBeVisible();
    await page.getByTestId('nav-/settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByTestId('page-title')).toHaveText('Settings');
    await expect(page.getByTestId('more-sheet')).toHaveCount(0);

    // More tab highlights while on a page it contains, and primary tabs
    // navigate back
    await expect(page.getByTestId('more-tab')).toHaveClass(/text-primary/);
    await page.getByTestId('nav-/dashboard').click();
    await expect(page.getByTestId('dashboard')).toBeVisible();
    await expect(page.getByTestId('page-title')).toHaveText('Dashboard');
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

  test('shows the pending-approvals badge on the Approvals tab', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);
    const inbox = [1, 2, 3].map((n) => ({
      requestId: `req-${n}`,
      requestNo: `ESS-REQ-2026-00030${n}`,
      type: 'LEAVE',
      employee: { id: 'e-2', name: 'Staff Member', department: 'Operations' },
      submittedAt: '2026-10-25T01:00:00.000Z',
      ageDays: 1,
      hasAttachments: false,
    }));
    await mockRequestsApi(page, { inbox });
    await loginWithMobile(page);

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('approvals-badge')).toHaveText('3', { timeout: 15000 });
    await expect(page.getByTestId('nav-/approvals')).toBeVisible();
  });
});
