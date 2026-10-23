import { expect, test } from '@playwright/test';
import { resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';
import { mockPayrollApi } from './helpers/payroll-mock';

async function loginMobile(page: import('@playwright/test').Page): Promise<void> {
  await resetAppState(page);
  await mockEssApi(page);
  await loginWithMobile(page);
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
}

async function openInquiries(page: import('@playwright/test').Page) {
  await page.goto('/payslips');
  await expect(page.getByTestId('payslips-page')).toBeVisible();
  await expect(page.getByTestId('payroll-summary-card')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('payroll-tab-inquiries').click();
  await expect(page.getByTestId('inquiry-list')).toBeVisible();
}

test.describe('ESS payroll inquiries (BRD §4.6)', () => {
  test('submits an inquiry with an attachment in ONE allowlisted multipart call', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockPayrollApi(page);

    await openInquiries(page);
    await page.getByTestId('new-inquiry').click();
    await page.getByTestId('inquiry-category').selectOption('INCORRECT_DEDUCTION');
    await page.getByTestId('inquiry-period').selectOption('per-9');
    await page.getByTestId('inquiry-subject').fill('Deduction looks wrong');
    await page.getByTestId('inquiry-description').fill('PPh 21 doubled this month.');
    await page.getByTestId('attachment-input').setInputFiles({
      name: 'bukti.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    });
    await page.getByTestId('inquiry-submit').click();

    await expect(page.getByText('Inquiry submitted')).toBeVisible();

    expect(calls.inquirySubmits).toHaveLength(1);
    const submit = calls.inquirySubmits[0];
    expect(submit.idempotencyKey).toBeTruthy();
    expect(submit.requestJson).toMatchObject({ category: 'INCORRECT_DEDUCTION', periodId: 'per-9', subject: 'Deduction looks wrong' });
    for (const forbidden of ['employeeId', 'status', 'netSalary']) {
      expect(Object.keys(submit.requestJson ?? {})).not.toContain(forbidden);
    }
    expect(submit.multipart).toContain('filename="bukti.pdf"');
  });

  test('blocks an invalid inquiry client-side without any submission', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockPayrollApi(page);

    await openInquiries(page);
    await page.getByTestId('new-inquiry').click();
    await page.getByTestId('inquiry-submit').click();

    await expect(page.getByText('Choose a category.')).toBeVisible();
    await expect(page.getByText('Describe the issue.')).toBeVisible();
    expect(calls.inquirySubmits).toHaveLength(0);
  });

  test('detail shows the thread; an employee reply updates it', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockPayrollApi(page);

    await openInquiries(page);
    await page.getByTestId('inquiry-row').click();

    await expect(page.getByTestId('inquiry-detail')).toBeVisible();
    await expect(page.getByTestId('inquiry-message').first()).toContainText('PPh 21 doubled');

    await page.getByTestId('inquiry-reply-input').fill('Any update on this?');
    await page.getByTestId('inquiry-reply-send').click();

    await expect(page.getByTestId('inquiry-thread')).toContainText('Any update on this?');
    expect(calls.replies).toHaveLength(1);
    expect(calls.replies[0].body).toEqual({ message: 'Any update on this?' });
  });

  test('a closed inquiry disables further replies', async ({ page }) => {
    await loginMobile(page);
    await mockPayrollApi(page, {
      inquiries: [{ inquiryId: 'inq-2', number: 'PAYINQ-2026-000001', category: 'OTHER', subject: 'Closed one', status: 'CLOSED', submittedAt: '2026-09-01T00:00:00.000Z', resolvedAt: '2026-09-05T00:00:00.000Z', attachmentCount: 0, messages: [] }],
    });

    await openInquiries(page);
    await page.getByTestId('inquiry-row').click();

    await expect(page.getByTestId('inquiry-detail-status')).toHaveText('Closed');
    await expect(page.getByTestId('inquiry-closed-note')).toBeVisible();
    await expect(page.getByTestId('inquiry-reply-send')).toHaveCount(0);
  });
});
