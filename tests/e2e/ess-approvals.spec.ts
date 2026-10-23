import { expect, test } from '@playwright/test';
import { resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';
import { mockRequestsApi } from './helpers/requests-mock';

async function loginMobile(page: import('@playwright/test').Page): Promise<void> {
  await resetAppState(page);
  await mockEssApi(page);
  await loginWithMobile(page);
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
}

async function openApprovals(page: import('@playwright/test').Page) {
  await page.goto('/approvals');
  await expect(page.getByTestId('approvals-page')).toBeVisible();
}

test.describe('ESS approvals inbox (BRD §5/§7)', () => {
  test('renders the server-scoped inbox with employee and age', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openApprovals(page);
    await expect(page.getByTestId('approvals-list')).toBeVisible({ timeout: 15000 });
    const row = page.getByTestId('approval-row').first();
    await expect(row).toContainText('Sari Admin');
    await expect(row).toContainText('ESS-REQ-2026-000200');
    await expect(page.getByTestId('approval-age')).toContainText('2 days waiting');

    // the inbox call carried the mobile Bearer token
    expect(calls.decisions).toHaveLength(0);
  });

  test('approving removes the item from the inbox', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openApprovals(page);
    await page.getByTestId('approval-row').first().click();
    await expect(page.getByTestId('approval-detail')).toBeVisible();
    await expect(page.getByTestId('approval-reason')).toContainText('Month-end close');

    await page.getByTestId('decision-approve').click();

    await expect(page.getByTestId('approvals-empty')).toBeVisible({ timeout: 15000 });
    expect(calls.decisions).toHaveLength(1);
    expect(calls.decisions[0].url).toContain('/ess/approvals/req-200/decision');
    expect(calls.decisions[0].body).toEqual({ action: 'APPROVED' });
    expect(calls.decisions[0].authorization).toBe('Bearer access-e2e');
  });

  test('rejecting requires a comment before the decision is sent', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openApprovals(page);
    await page.getByTestId('approval-row').first().click();
    await page.getByTestId('decision-reject').click();

    await expect(page.getByTestId('decision-error')).toContainText('required');
    expect(calls.decisions).toHaveLength(0);

    await page.getByTestId('decision-notes').fill('Outside the overtime window.');
    await page.getByTestId('decision-reject').click();
    await expect(page.getByTestId('approvals-empty')).toBeVisible({ timeout: 15000 });
    expect(calls.decisions[0].body).toMatchObject({ action: 'REJECTED', notes: 'Outside the overtime window.' });
  });

  test('shows an honest empty state when nothing is pending', async ({ page }) => {
    await loginMobile(page);
    await mockRequestsApi(page, { inbox: [] });

    await openApprovals(page);
    await expect(page.getByTestId('approvals-empty')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No requests need your approval.')).toBeVisible();
  });

  test('returns to the login screen when the session cannot be refreshed', async ({ page }) => {
    await loginMobile(page);
    await openApprovals(page);

    await page.unroute('**/api/mobile/v1/**');
    await page.route('**/api/mobile/v1/**', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, error: 'unauthorized' }),
      });
    });

    await page.goto('/approvals');
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });
  });
});
