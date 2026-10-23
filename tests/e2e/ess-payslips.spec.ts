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

async function openPayslips(page: import('@playwright/test').Page) {
  await page.goto('/payslips');
  await expect(page.getByTestId('payslips-page')).toBeVisible();
  await expect(page.getByTestId('payroll-summary-card')).toBeVisible({ timeout: 15000 });
}

test.describe('ESS payslips & payroll (BRD §5)', () => {
  test('renders the payroll summary with IDR amounts and the Bearer token', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockPayrollApi(page);

    await openPayslips(page);

    await expect(page.getByTestId('payroll-net')).toHaveText('Rp10.250.000');
    await expect(page.getByTestId('payroll-payment-status')).toHaveText('Paid');
    await expect(page.getByTestId('payroll-payment-date')).toHaveText('Paid 2026-09-27');
    await expect(page.getByTestId('payroll-ytd')).toContainText('Rp102.500.000');

    expect(calls.summaryAuth[0]).toBe('Bearer access-e2e');
  });

  test('unpublished payroll shows an honest empty state with no amounts', async ({ page }) => {
    await loginMobile(page);
    await mockPayrollApi(page, { published: false });

    await openPayslips(page);

    await expect(page.getByTestId('payroll-unpublished')).toBeVisible();
    await expect(page.getByTestId('payroll-net')).toHaveCount(0);
    await expect(page.getByTestId('payslip-list-empty')).toBeVisible();
  });

  test('history rows open a payslip with separated sections and IDR lines', async ({ page }) => {
    await loginMobile(page);
    await mockPayrollApi(page);

    await openPayslips(page);
    await expect(page.getByTestId('payslip-row')).toHaveCount(1);
    await page.getByTestId('payslip-row').click();

    await expect(page.getByTestId('payslip-detail')).toBeVisible();
    await expect(page.getByTestId('summary-net')).toHaveText('Rp10.250.000');
    // BRD §4.2/§4.4 — sections separated, employer ≠ employee deductions
    await expect(page.getByTestId('earning-line-amount').first()).toHaveText('Rp10.000.000');
    await expect(page.getByTestId('deduction-line-amount')).toHaveText('−Rp450.000');
    await expect(page.getByTestId('employee-contribution-line-amount')).toHaveText('−Rp100.000');
    await expect(page.getByTestId('employer-contribution-line-amount')).toHaveText('Rp176.000');
    // the deliberate salary leak probe never survives
    await expect(page.getByTestId('payslip-detail')).not.toContainText('10000000,');
  });

  test('downloads the server-generated payslip PDF and surfaces the generating state', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockPayrollApi(page);

    await openPayslips(page);
    await page.getByTestId('payslip-row').click();
    await expect(page.getByTestId('payslip-download-pdf')).toBeEnabled();
    await page.getByTestId('payslip-download-pdf').click();
    await expect(page.getByText('Payslip PDF saved')).toBeVisible();
    expect(calls.pdfDownloads).toBe(1);
  });

  test('PDF still generating is surfaced without an error crash', async ({ page }) => {
    await loginMobile(page);
    await mockPayrollApi(page, { pdfGenerating: true });

    await openPayslips(page);
    await page.getByTestId('payslip-row').click();
    await expect(page.getByTestId('payslip-pdf-pending')).toContainText('being generated');
    await expect(page.getByTestId('payslip-download-pdf')).toBeDisabled();
  });

  test('tax documents list and download; tax tab carries the remittance disclaimer', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockPayrollApi(page);

    await openPayslips(page);
    await page.getByTestId('payroll-tab-tax').click();

    await expect(page.getByTestId('tax-document-row')).toBeVisible();
    await expect(page.getByTestId('tax-document-name')).toContainText('1721-A1');
    await expect(page.getByTestId('bpjs-disclaimer')).toContainText('not proof of remittance');

    await page.getByTestId('tax-document-download').click();
    await expect(page.getByText('Document saved')).toBeVisible();
    expect(calls.documentDownloads).toBe(1);
  });

  test('returns to the login screen when the session cannot be refreshed', async ({ page }) => {
    await loginMobile(page);
    await mockPayrollApi(page);
    await openPayslips(page);

    await page.unroute('**/api/mobile/v1/ess/payroll/**');
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

    await page.goto('/payslips');
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });
  });
});
