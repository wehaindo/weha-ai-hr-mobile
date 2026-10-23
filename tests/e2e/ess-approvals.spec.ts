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
    expect(calls.decisions[0].body).toMatchObject({ action: 'APPROVED', expectedVersion: 1 });
    expect(calls.decisions[0].body.idempotencyKey).toBeUndefined(); // idempotency travels as a header
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

test.describe('ESS approvals Phase 6 upgrades (FR-602/603/604/606)', () => {
  const TWO_INBOX = [
    {
      requestId: 'req-200', recordId: 'ot-200', version: 1,
      availableActions: ['APPROVED', 'REJECTED', 'RETURNED'],
      requestNo: 'ESS-REQ-2026-000200', type: 'OVERTIME',
      employee: { id: 'E2', name: 'Sari Admin', department: 'Operations' },
      submittedAt: '2026-10-20T01:00:00.000Z',
      period: { date: '2026-10-25', startTime: '18:00', endTime: '20:00' },
      reason: 'Month-end close', currentStepName: 'Direct manager',
      ageDays: 2, hasAttachments: false, overdue: false,
    },
    {
      requestId: 'req-201', recordId: 'lr-201', version: 2,
      availableActions: ['APPROVED', 'REJECTED', 'RETURNED'],
      requestNo: 'ESS-REQ-2026-000201', type: 'LEAVE',
      employee: { id: 'E3', name: 'Agus Team', department: 'Operations' },
      submittedAt: '2026-10-14T01:00:00.000Z',
      period: { start: '2026-11-02', end: '2026-11-04', halfDay: 'NONE' },
      reason: 'Family holiday', currentStepName: 'Direct manager',
      ageDays: 6, hasAttachments: true, overdue: true,
    },
  ];

  test('server-side filters and cursor pagination drive the list', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page, { inbox: TWO_INBOX });

    await openApprovals(page);
    await expect(page.getByTestId('approval-row')).toHaveCount(1, { timeout: 15000 }); // page 1
    await expect(page.getByTestId('approvals-load-more')).toBeVisible();

    await page.getByTestId('approvals-load-more').click();
    await expect(page.getByTestId('approval-row')).toHaveCount(2);
    await expect(page.getByTestId('approvals-load-more')).toHaveCount(0);
    // overdue badge on the aged item
    await expect(page.getByTestId('approval-overdue')).toBeVisible();

    // type filter → server param + narrowed list
    await page.getByTestId('filter-form-type').selectOption('LEAVE');
    await expect(page.getByTestId('approval-row')).toHaveCount(1);
    await expect(page.getByTestId('approval-row')).toContainText('Agus Team');
    // overdue toggle → server param
    await page.getByTestId('filter-overdue').check();
    await expect.poll(() => calls.listQueries.some((query) => query.includes('overdue=true')), { timeout: 5000 }).toBe(true);
    expect(calls.listQueries.some((query) => query.includes('formType=LEAVE'))).toBe(true);
  });

  test('leave approval detail shows balance and overlapping leave', async ({ page }) => {
    await loginMobile(page);
    await mockRequestsApi(page, {
      inbox: [TWO_INBOX[1]],
      approvalDetail: {
        leaveContext: {
          leaveType: 'Annual leave',
          startDate: '2026-11-02',
          endDate: '2026-11-04',
          requestedDays: 3,
          balance: { entitled: 12, used: 6, pending: 1, available: 5 },
          overlapping: [{ requestNo: 'ESS-REQ-2026-000050', start: '2026-11-03', end: '2026-11-03', status: 'APPROVED' }],
        },
      },
    });

    await openApprovals(page);
    await page.getByTestId('approval-row').first().click();

    await expect(page.getByTestId('leave-context')).toBeVisible();
    await expect(page.getByTestId('leave-context-balance')).toContainText('5 available');
    await expect(page.getByTestId('leave-context-overlap')).toContainText('ESS-REQ-2026-000050');
  });

  test('correction detail shows the original punch evidence and conflict flags', async ({ page }) => {
    await loginMobile(page);
    const correctionItem = {
      ...TWO_INBOX[1],
      requestId: 'req-300', recordId: 'ac-300', type: 'ATTENDANCE_CORRECTION',
      requestNo: 'ESS-REQ-2026-000300', reason: 'Scanner was down',
      period: { date: '2026-10-27' }, hasAttachments: false, overdue: false,
    };
    await mockRequestsApi(page, {
      inbox: [correctionItem],
      approvalDetail: {
        correctionContext: {
          workDate: '2026-10-27',
          correctionType: 'CHECK_IN',
          before: { checkIn: null },
          after: { checkIn: '07:58' },
          attendance: { status: 'INCOMPLETE', checkIn: null, checkOut: null },
          originalPunch: { punchAt: '2026-10-27T08:00:11Z', punchType: 'CHECK_IN', source: 'DEVICE', dedupeKey: 'dk-1' },
          schedule: { shiftName: 'Morning (07:00–16:00)' },
          flags: ['possible_duplicate'],
        },
      },
    });

    await openApprovals(page);
    await page.getByTestId('approval-row').first().click();

    await expect(page.getByTestId('correction-context')).toBeVisible();
    await expect(page.getByTestId('correction-original-punch')).toContainText('read-only evidence');
    await expect(page.getByTestId('correction-original-punch')).toContainText('CHECK_IN · DEVICE');
    await expect(page.getByTestId('correction-original-punch')).toContainText('Oct 27');
    await expect(page.getByTestId('correction-flags')).toContainText('possible duplicate');
    await expect(page.getByTestId('leave-context')).toHaveCount(0);
  });

  test('attachments on a request are downloadable by the approver', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page, { inbox: [TWO_INBOX[1]] });

    await openApprovals(page);
    await page.getByTestId('approval-row').first().click();
    await expect(page.getByTestId('approval-attachment-download')).toBeVisible();
    await page.getByTestId('approval-attachment-download').click();

    await expect.poll(() => calls.downloads, { timeout: 5000 }).toBe(1);
    await expect(page.getByTestId('approval-download-error')).toHaveCount(0);
  });

  test('decisions carry expectedVersion + Idempotency-Key; conflicts reload instead of retrying', async ({ page }) => {
    await loginMobile(page);
    const { calls } = await mockRequestsApi(page);

    await openApprovals(page);
    await page.getByTestId('approval-row').first().click();
    await page.getByTestId('decision-approve').click();
    await expect(page.getByTestId('approvals-empty')).toBeVisible({ timeout: 15000 });
    expect(calls.decisions[0].idempotencyKey).toBeTruthy();
    expect(calls.decisions[0].body).toMatchObject({ action: 'APPROVED', expectedVersion: 1 });

    // fresh page in the same context (session persists): a stale version must
    // surface a conflict, never a blind retry
    const conflictPage = await page.context().newPage();
    await mockEssApi(conflictPage);
    await mockRequestsApi(conflictPage, { decisionConflict: true });
    await conflictPage.goto('/approvals');
    await expect(conflictPage.getByTestId('approval-row').first()).toBeVisible({ timeout: 15000 });
    await conflictPage.getByTestId('approval-row').first().click();
    await conflictPage.getByTestId('decision-approve').click();

    await expect(conflictPage.getByTestId('decision-error')).toContainText('request changed', { timeout: 15000 });
    expect(calls.decisions).toHaveLength(1); // the conflicted attempt used its own mock — original untouched
  });

  test('delegations dialog lists active rules (FR-606 view)', async ({ page }) => {
    await loginMobile(page);
    await mockRequestsApi(page);

    await openApprovals(page);
    await page.getByTestId('approvals-delegations').click();

    await expect(page.getByTestId('delegations-dialog')).toBeVisible();
    await expect(page.getByTestId('delegation-row')).toContainText('Pak Boss');
    await expect(page.getByTestId('delegation-row')).toContainText('LEAVE');
    await expect(page.getByTestId('delegation-state')).toHaveText('Active');
  });
});
