import { expect, test } from '@playwright/test';
import { resetAppState } from './helpers/test-utils';
import { ESSENTIAL_EMPLOYEE, loginWithMobile, mockEssApi } from './helpers/ess-mock';

test.describe('ESS profile', () => {
  test('renders the authorized profile sections after a mobile login', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockEssApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    await page.goto('/profile');
    await expect(page.getByTestId('profile-page')).toBeVisible();
    const profilePage = page.getByTestId('profile-page');

    // Identity / organization / contact sections (real data, no placeholders)
    await expect(profilePage.getByText('Budi Santoso').first()).toBeVisible();
    await expect(profilePage.getByText('EMP-007').first()).toBeVisible();
    await expect(profilePage.getByText('Store Supervisor').first()).toBeVisible();
    await expect(profilePage.getByText('WEHA Retail').first()).toBeVisible();
    await expect(profilePage.getByText('Operations').first()).toBeVisible();
    await expect(profilePage.getByText('+628111111').first()).toBeVisible();

    // the profile request carried the Bearer token (server resolves identity)
    expect(calls.profileGets.length).toBeGreaterThan(0);
    expect(calls.profileGets[0]).toBe('Bearer access-e2e');
  });

  test('sends a PATCH containing only the changed allowlisted field', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockEssApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Phone number').fill('+628999999');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Profile updated')).toBeVisible();
    expect(calls.profilePatches).toHaveLength(1);

    const patch = calls.profilePatches[0];
    expect(patch.body).toEqual({ phone: '+628999999' }); // unchanged email not sent, no id ever
    expect(Object.keys(patch.body)).not.toContain('id');
    expect(Object.keys(patch.body)).not.toContain('employeeId');
    expect(patch.authorization).toBe('Bearer access-e2e');

    // updated value rendered from the response
    await expect(page.getByTestId('profile-page').getByText('+628999999').first()).toBeVisible();
  });

  test('blocks an invalid email client-side without calling the API', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockEssApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Personal email').fill('not-an-email');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    expect(calls.profilePatches).toHaveLength(0);
  });

  test('returns to the login screen when the session cannot be refreshed', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    // Backend starts rejecting the access token AND the refresh — profile GET
    // returns 401, refresh returns 401 → session_expired → reauth.
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

    await page.goto('/profile');
    // hook logs out + redirects on session_expired
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });
  });

  test('shows a retryable error state when the backend is unreachable', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    // kill the API after login (simulates offline / backend down)
    await page.unroute('**/api/mobile/v1/**');
    await page.route('**/api/mobile/v1/**', (route) => route.abort('connectionfailed'));

    await page.goto('/profile');
    await expect(page.getByText('Could not load your profile')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    // still authenticated — no forced logout on network failure
    await expect(page.getByTestId('user-menu')).toBeVisible();
  });

  test('marks employee number as read-only identity (no inputs for it)', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit' }).click();

    // edit form only exposes contract fields (BRD §4.3)
    await expect(page.getByLabel('Personal email')).toBeVisible();
    await expect(page.getByLabel('Phone number')).toBeVisible();
    expect(await page.getByLabel('Employee number').count()).toBe(0);
    expect(await page.getByLabel('Department').count()).toBe(0);

    // sanity: employee data still shown read-only elsewhere
    await expect(page.getByTestId('profile-page').getByText(ESSENTIAL_EMPLOYEE.employeeNumber).first()).toBeVisible();
  });
});
