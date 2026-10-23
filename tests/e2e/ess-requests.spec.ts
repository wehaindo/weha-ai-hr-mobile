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

async function openRequests(page: import('@playwright/test').Page) {
  await page.goto('/requests');
  await expect(page.getByTestId('requests-page')).toBeVisible();
  await expect(page.getByTestId('request-list').first()).toBeVisible({ timeout: 15000 });
}

test.describe('ESS requests history & actions (BRD §4.5)', () => {
  test('renders the consolidated history with statuses and filters', async ({ page }) => {
    await loginMobile(page);
    await mockRequestsApi(page);

    await openRequests(page);

    await expect(page.getByTestId('request-row')).toHaveCount(3);
    await expect(page.getByTestId('request-row').filter({ hasText: 'ESS-REQ-2026-000101' })).toHaveAttribute('data-status', 'RETURNED');

    await page.getByTestId('filter-returned').click();
    await expect(page.getByTestId('request-row')).toHaveCount(1);
    await expect(page.getByTestId('request-no')).toContainText('ESS-REQ-2026-000101');
  });

  test('detail shows the approval timeline and return reason', async ({ page }) => {
    await loginMobile(page);
    await mockRequestsApi(page);

    await openRequests(page);
    await page.getByTestId('request-row').filter({ hasText: 'ESS-REQ-2026-000101' }).click();

    await expect(page.getByTestId('request-detail')).toBeVisible();
    await expect(page.getByTestId('detail-return-reason')).toContainText('sick note');
    await expect(page.getByTestId('timeline-item')).toContainText('Returned for correction');
    await expect(page.getByTestId('timeline-item')).toContainText('Sari Admin');
  });

  test('resubmitting a returned request sends only the edited reason', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openRequests(page);
    await page.getByTestId('request-row').filter({ hasText: 'ESS-REQ-2026-000101' }).click();
    await page.getByTestId('detail-resubmit').click();
    await page.getByTestId('resubmit-reason').fill('Doctor note attached now.');
    await page.getByTestId('resubmit-confirm').click();

    await expect(page.getByText('Request resubmitted')).toBeVisible();
    await expect(page.getByTestId('request-row').filter({ hasText: 'ESS-REQ-2026-000101' })).toHaveAttribute('data-status', 'IN_REVIEW');

    expect(calls.resubmits).toHaveLength(1);
    expect(calls.resubmits[0].multipart).toContain('Doctor note attached now.');
    expect(calls.resubmits[0].multipart).not.toContain('employeeId');
  });

  test('cancelling a pending request requires a reason and flips the status', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openRequests(page);
    await page.getByTestId('request-row').filter({ hasText: 'ESS-REQ-2026-000100' }).click();
    await page.getByTestId('detail-cancel').click();
    await page.getByTestId('cancel-reason').fill('Plans changed');
    await page.getByTestId('cancel-confirm').click();

    await expect(page.getByText('Cancellation requested')).toBeVisible();
    await expect(page.getByTestId('request-row').filter({ hasText: 'ESS-REQ-2026-000100' })).toHaveAttribute('data-status', 'CANCELLED');
    expect(calls.cancels[0].body).toEqual({ reason: 'Plans changed' });
  });

  test('submits a permission request through the type picker', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openRequests(page);
    await page.getByTestId('new-request').click();
    await page.getByTestId('picker-permission').click();

    await expect(page.getByTestId('request-form')).toHaveAttribute('data-type', 'PERMISSION');
    await page.getByTestId('permission-type').selectOption('sick');
    await page.getByTestId('permission-date').fill('2026-11-10');
    await page.getByTestId('permission-reason').fill('Flu');
    await page.getByTestId('request-submit').click();

    await expect(page.getByText('Request submitted')).toBeVisible();
    expect(calls.submits).toHaveLength(1);
    expect(calls.submits[0].url).toContain('/ess/permission/requests');
    expect(calls.submits[0].requestJson).toMatchObject({ permissionCode: 'sick', date: '2026-11-10', reason: 'Flu' });
  });
});
