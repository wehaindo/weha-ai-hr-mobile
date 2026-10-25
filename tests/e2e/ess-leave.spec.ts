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

async function openLeave(page: import('@playwright/test').Page) {
  await page.goto('/leave');
  await expect(page.getByTestId('leave-page')).toBeVisible();
  await expect(page.getByTestId('balance-card').first()).toBeVisible({ timeout: 15000 });
}

test.describe('ESS leave (BRD §4.1)', () => {
  test('renders balances and own leave requests', async ({ page }) => {
    await loginMobile(page);
    await mockRequestsApi(page);

    await openLeave(page);

    const balance = page.getByTestId('balance-card').first();
    await expect(page.getByTestId('leave-balances')).toBeVisible();
    // dashboard-style 2-column status grid (pending / approved / rejected / total)
    await expect(page.getByTestId('leave-status-grid')).toBeVisible();
    await expect(page.getByTestId('leave-status-pending')).toBeVisible();
    await expect(page.getByTestId('leave-status-total')).toBeVisible();
    await expect(balance).toHaveAttribute('data-code', 'ANNUAL');
    await expect(page.getByTestId('balance-available')).toContainText('5');
    await expect(page.getByTestId('balance-detail')).toContainText('6 used of 12');

    // own leave list (seeded SUBMITTED row)
    await expect(page.getByTestId('request-list')).toBeVisible();
    await expect(page.getByTestId('request-no')).toContainText('ESS-REQ-2026-000100');
  });

  test('submits a leave request via ONE allowlisted multipart call', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openLeave(page);
    await page.getByTestId('new-leave-request').click();
    await page.getByTestId('leave-type').selectOption('lt_annual');
    await page.getByTestId('leave-start').fill('2026-12-07');
    await page.getByTestId('leave-end').fill('2026-12-09');
    await page.getByTestId('leave-reason').fill('Year-end trip');
    await page.getByTestId('leave-submit').click();

    await expect(page.getByText('Leave request submitted')).toBeVisible();
    // the new request appears in the list after the refresh
    await expect(page.getByTestId('request-row').first()).toContainText('ESS-REQ-2026-000500');

    expect(calls.submits).toHaveLength(1);
    const submit = calls.submits[0];
    expect(submit.url).toContain('/api/mobile/v1/ess/leave/requests');
    expect(submit.idempotencyKey).toBeTruthy();
    expect(submit.requestJson).toMatchObject({ leaveTypeId: 'lt_annual', startDate: '2026-12-07', endDate: '2026-12-09', reason: 'Year-end trip' });
    for (const forbidden of ['employeeId', 'status', 'requestNo', 'workingDays']) {
      expect(Object.keys(submit.requestJson ?? {})).not.toContain(forbidden);
    }
    expect(submit.multipart).toContain('name="request"');
  });

  test('blocks invalid forms client-side without any submission', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openLeave(page);
    await page.getByTestId('new-leave-request').click();
    await page.getByTestId('leave-submit').click();

    await expect(page.getByText('Choose a leave type.')).toBeVisible();
    await expect(page.getByText('Enter a reason.')).toBeVisible();
    expect(calls.submits).toHaveLength(0);
  });

  test('shows the server overlap rejection inline', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page, {
      submit: () => ({
        status: 409,
        json: { success: false, error: 'overlap', message: 'Those dates overlap an existing leave request.' },
      }),
    });

    await openLeave(page);
    await page.getByTestId('new-leave-request').click();
    await page.getByTestId('leave-type').selectOption('lt_annual');
    await page.getByTestId('leave-start').fill('2026-12-07');
    await page.getByTestId('leave-end').fill('2026-12-09');
    await page.getByTestId('leave-reason').fill('Trip');
    await page.getByTestId('leave-submit').click();

    await expect(page.getByTestId('leave-server-error')).toContainText('overlap an existing leave request');
    expect(calls.submits).toHaveLength(1); // it reached the server and was refused
  });

  test('saves a draft locally and surfaces it after a reload', async ({ page }) => {
    await loginMobile(page);
    await mockRequestsApi(page);

    await openLeave(page);
    await page.getByTestId('new-leave-request').click();
    await page.getByTestId('leave-type').selectOption('lt_annual');
    await page.getByTestId('leave-save-draft').click();
    await expect(page.getByText('Draft saved on this device')).toBeVisible();

    await page.reload();
    await openLeave(page);
    await expect(page.getByTestId('leave-drafts')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('leave-draft-restore')).toBeVisible();
  });

  test('uploads attachments inside the submit multipart', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openLeave(page);
    await page.getByTestId('new-leave-request').click();
    await page.getByTestId('leave-type').selectOption('lt_annual');
    await page.getByTestId('leave-start').fill('2026-12-07');
    await page.getByTestId('leave-end').fill('2026-12-08');
    await page.getByTestId('leave-reason').fill('Medical');
    await page.getByTestId('attachment-input').setInputFiles({
      name: 'surat-dokter.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    });
    await expect(page.getByTestId('attachment-chip')).toContainText('surat-dokter.pdf');
    await page.getByTestId('leave-submit').click();

    await expect(page.getByText('Leave request submitted')).toBeVisible();
    expect(calls.submits[0].multipart).toContain('filename="surat-dokter.pdf"');
  });
});
