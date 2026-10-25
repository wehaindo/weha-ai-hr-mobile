import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';
import { mockAttendanceApi } from './helpers/attendance-mock';

// Dashboard after the redesign: welcome header → 2-column request-status grid
// (one card per request type, counts grouped from a single /ess/requests call)
// → My attendance section. Device cards and the widget registry are gone.

const REQUESTS = [
  { id: 'r1', requestNo: 'ESS-202610-000005', type: 'LEAVE', status: 'SUBMITTED', submittedAt: '2026-10-24T08:00:00.000Z', workingDays: 1, expectedHours: null, period: { start: '2026-11-03', end: '2026-11-03' }, attachmentCount: 0 },
  { id: 'r2', requestNo: 'ESS-202610-000004', type: 'LEAVE', status: 'APPROVED', submittedAt: '2026-10-20T08:00:00.000Z', decidedAt: '2026-10-21T09:00:00.000Z', workingDays: 2, expectedHours: null, period: { start: '2026-10-28', end: '2026-10-29' }, attachmentCount: 0 },
  { id: 'r3', requestNo: 'ESS-202610-000003', type: 'PERMISSION', status: 'IN_REVIEW', submittedAt: '2026-10-19T08:00:00.000Z', workingDays: 1, expectedHours: null, period: { start: '2026-10-27', end: '2026-10-27' }, attachmentCount: 0 },
  { id: 'r4', requestNo: 'ESS-202610-000002', type: 'OVERTIME', status: 'REJECTED', submittedAt: '2026-10-15T08:00:00.000Z', decidedAt: '2026-10-16T09:00:00.000Z', workingDays: null, expectedHours: 2, period: { start: '2026-10-18', end: '2026-10-18' }, attachmentCount: 0 },
  { id: 'r5', requestNo: 'ESS-202610-000001', type: 'ATTENDANCE_CORRECTION', status: 'APPROVED', submittedAt: '2026-10-10T08:00:00.000Z', decidedAt: '2026-10-11T09:00:00.000Z', workingDays: 1, expectedHours: null, period: { start: '2026-10-12', end: '2026-10-12' }, attachmentCount: 0 },
];

async function mockRequestsApi(page: Page): Promise<number[]> {
  const counts: number[] = [];
  await page.route('**/api/mobile/v1/ess/requests*', async (route) => {
    counts.push(1);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-name',
      },
      body: JSON.stringify({ success: true, data: { requests: REQUESTS, nextCursor: null } }),
    });
  });
  return counts;
}

test.describe('ESS dashboard', () => {
  test('renders the request-status grid and attendance section for a mobile session', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);
    await mockRequestsApi(page);
    await mockAttendanceApi(page);

    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    // welcome header uses the authorized identity
    await expect(page.getByRole('heading', { name: /Welcome back, Budi Santoso/ })).toBeVisible();

    // 2-column request-status grid with counts grouped per type
    const grid = page.getByTestId('request-status-grid');
    await expect(grid).toBeVisible();

    const leave = page.getByTestId('requests-card-leave');
    await expect(leave).toContainText('2 requests');
    await expect(leave.getByTestId('requests-card-pending-leave')).toHaveText('1 pending');
    await expect(leave.getByTestId('requests-card-approved-leave')).toHaveText('1 approved');
    await expect(leave.getByTestId('requests-card-status-leave')).toHaveText('Submitted'); // newest first

    const permission = page.getByTestId('requests-card-permission');
    await expect(permission.getByTestId('requests-card-pending-permission')).toHaveText('1 pending');
    await expect(permission.getByTestId('requests-card-status-permission')).toHaveText('In review');

    const overtime = page.getByTestId('requests-card-overtime');
    await expect(overtime.getByTestId('requests-card-rejected-overtime')).toHaveText('1 rejected');

    const correction = page.getByTestId('requests-card-attendance_correction');
    await expect(correction.getByTestId('requests-card-approved-attendance_correction')).toHaveText('1 approved');

    // My attendance section below the grid (real attendance mocks)
    const section = page.getByTestId('attendance-section');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('attendance-status-card')).toBeVisible();
    await expect(page.getByTestId('attendance-current')).toHaveText('Not checked in');
    await expect(page.getByTestId('punch-action')).toHaveText('Check in');
    await expect(page.getByTestId('today-empty')).toBeVisible();

    // grid sits above attendance in document order
    const gridBox = await grid.boundingBox();
    const sectionBox = await section.boundingBox();
    expect(gridBox && sectionBox && gridBox.y < sectionBox.y).toBe(true);
  });

  test('local device accounts get honest no-session states', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);
    await loginAsAdmin(page);
    await expect(page.getByTestId('dashboard')).toBeVisible();

    await expect(page.getByTestId('requests-grid-no-session')).toBeVisible();
    await expect(page.getByTestId('attendance-no-session')).toBeVisible();
    await expect(page.getByTestId('punch-action')).toHaveCount(0);
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
    await expect(page.getByTestId('requests-grid-no-session')).toBeVisible();

    expect(profileGets).toBe(0);
  });
});
