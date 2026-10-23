import { expect, test } from '@playwright/test';
import { resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';
import { mockManagerApi } from './helpers/manager-mock';

async function loginMobile(page: import('@playwright/test').Page): Promise<void> {
  await resetAppState(page);
  await mockEssApi(page);
  await loginWithMobile(page);
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
}

async function openManager(page: import('@playwright/test').Page) {
  await page.goto('/manager');
  await expect(page.getByTestId('manager-page')).toBeVisible();
  await expect(page.getByTestId('manager-stats')).toBeVisible({ timeout: 15000 });
}

test.describe('ESS manager dashboard (FR-601)', () => {
  test('renders counts, team rows with attendance, and strips non-whitelisted fields', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockManagerApi(page);

    await openManager(page);

    await expect(page.getByTestId('manager-stat-team-value')).toHaveText('8');
    await expect(page.getByTestId('manager-stat-pending-value')).toHaveText('3');
    await expect(page.getByTestId('manager-stat-overdue-value')).toHaveText('1');

    await expect(page.getByTestId('team-list')).toBeVisible();
    const firstRow = page.getByTestId('team-row').first();
    await expect(firstRow).toContainText('Budi Santoso');
    await expect(firstRow).toContainText('Operations');
    await expect(page.getByTestId('team-attendance').first()).toHaveText('Present');
    // page 1 is a cursor slice — load the rest for the not-yet-calculated row
    await page.getByTestId('team-load-more').click();
    // honest not-yet-calculated state (null todayAttendance)
    await expect(page.getByTestId('team-attendance').nth(1)).toHaveText('Not yet calculated');
    // the salary leak probe never renders
    await expect(page.getByTestId('manager-page')).not.toContainText('99999999');

    expect(calls.dashboardAuth[0]).toBe('Bearer access-e2e');
  });

  test('team search hits the server-side query (debounced)', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockManagerApi(page);

    await openManager(page);
    await page.getByTestId('team-search').fill('Budi');

    // debounce 400ms → refetch with ?search=
    await expect.poll(() => calls.teamQueries.some((query) => query.includes('search=Budi')), { timeout: 5000 }).toBe(true);
    await expect(page.getByTestId('team-row')).toHaveCount(1);
    await expect(page.getByTestId('team-member-name')).toHaveText('Budi Santoso');
  });

  test('load more appends the next cursor page', async ({ page }) => {
    await loginMobile(page);
    await mockManagerApi(page);

    await openManager(page);
    await expect(page.getByTestId('team-row')).toHaveCount(1); // page 1 slice
    await expect(page.getByTestId('team-load-more')).toBeVisible();

    await page.getByTestId('team-load-more').click();
    await expect(page.getByTestId('team-row')).toHaveCount(2);
    await expect(page.getByTestId('team-load-more')).toHaveCount(0);
  });

  test('a non-manager gets the honest empty state', async ({ page }) => {
    await loginMobile(page);
    await mockManagerApi(page, { empty: true });

    await openManager(page);
    await expect(page.getByTestId('manager-empty')).toBeVisible();
    await expect(page.getByTestId('manager-stat-team-value')).toHaveText('0');
    await expect(page.getByTestId('team-list')).toHaveCount(0);
  });

  test('returns to the login screen when the session cannot be refreshed', async ({ page }) => {
    await loginMobile(page);
    await mockManagerApi(page);
    await openManager(page);

    await page.unroute('**/api/mobile/v1/ess/manager/**');
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

    await page.goto('/manager');
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });
  });
});
