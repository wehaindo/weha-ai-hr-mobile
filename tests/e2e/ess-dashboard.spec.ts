import { expect, test } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';

test.describe('ESS dashboard', () => {
  test('renders employee summary + permission-aware shortcuts for a mobile session', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    // BRD §4.1A/B — real authorized data in the summary widget
    const summary = page.getByTestId('widget-employee-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Budi Santoso');
    await expect(summary).toContainText('EMP-007');
    await expect(summary).toContainText('Store Supervisor');

    // welcome header uses the authorized identity
    await expect(page.getByRole('heading', { name: /Welcome back, Budi Santoso/ })).toBeVisible();

    // BRD §4.1C — available services are linked, coming services are not
    const shortcuts = page.getByTestId('widget-service-shortcuts');
    await expect(shortcuts).toBeVisible();
    await expect(shortcuts.getByTestId('service-profile').locator('xpath=ancestor::a')).toBeVisible();
    await expect(shortcuts.getByTestId('service-attendance').locator('xpath=ancestor::a')).toBeVisible();
    await expect(shortcuts.getByTestId('service-payslips').locator('xpath=ancestor::a')).toBeVisible();

    // Phase 5 — payroll widget present (honest error state without a payroll mock)
    await expect(page.getByTestId('widget-payroll-summary')).toBeVisible();

    // BRD §4.1B — future widgets clearly marked, zero fabricated data
    const unavailable = page.getByTestId('widget-unavailable');
    await expect(unavailable.first()).toBeVisible();
    await expect(unavailable.first()).toContainText('Not available yet');
  });

  test('shows the WEHA-account prompt for a local device account', async ({ page }) => {
    await resetAppState(page);
    await loginAsAdmin(page);
    await expect(page.getByTestId('dashboard')).toBeVisible();

    const summary = page.getByTestId('widget-employee-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Sign in with a WEHA account');
    await expect(summary).not.toContainText('EMP-');
  });

  test('does not call the profile API for a local device account', async ({ page }) => {
    await resetAppState(page);
    let profileGets = 0;
    await page.route('**/api/mobile/v1/employees/me*', (route) => {
      profileGets += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'unavailable' }),
      });
    });

    await loginAsAdmin(page);
    await expect(page.getByTestId('dashboard')).toBeVisible();
    await expect(page.getByTestId('widget-employee-summary')).toBeVisible();

    expect(profileGets).toBe(0);
  });
});
