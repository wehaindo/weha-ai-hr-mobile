import { expect, test } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';
import { ATTENDANCE_WORKSITE, mockAttendanceApi } from './helpers/attendance-mock';

const HQ = { latitude: ATTENDANCE_WORKSITE.latitude, longitude: ATTENDANCE_WORKSITE.longitude };
// Far outside the 100 m radius (tens of km away).
const FAR_AWAY = { latitude: -6.35, longitude: 106.55 };

async function loginMobile(page: import('@playwright/test').Page): Promise<void> {
  await resetAppState(page);
  await mockEssApi(page);
  await loginWithMobile(page);
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
}

test.describe('ESS attendance', () => {
  test('renders status, methods and the punch card for a mobile session', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);
    const calls = await mockAttendanceApi(page);
    await loginWithMobile(page);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    await page.goto('/attendance');
    await expect(page.getByTestId('attendance-page')).toBeVisible();
    await expect(page.getByTestId('attendance-current')).toHaveText('Not checked in');
    await expect(page.getByTestId('readiness-gps')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('readiness-qr')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('readiness-sync')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('punch-action')).toHaveText('Check in');
    await expect(page.getByTestId('today-empty')).toBeVisible();

    expect(calls.configAuth[0]).toBe('Bearer access-e2e');
  });

  test('local device accounts get the no-session state without any attendance API call', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);
    const calls = await mockAttendanceApi(page);
    await loginAsAdmin(page);

    await page.goto('/attendance');
    await expect(page.getByTestId('attendance-no-session')).toBeVisible();

    expect(calls.configAuth).toHaveLength(0);
    expect(calls.statusGets).toBe(0);
    expect(calls.punchPosts).toHaveLength(0);
  });

  test('GPS check-in records an event with an allowlisted, idempotent payload', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation(HQ);
    await loginMobile(page);
    const calls = await mockAttendanceApi(page);

    await page.goto('/attendance');
    await expect(page.getByTestId('punch-action')).toBeEnabled();
    await page.getByTestId('punch-action').click();

    await expect(page.getByTestId('punch-confirmation')).toHaveAttribute('data-kind', 'recorded', { timeout: 15000 });
    await expect(page.getByTestId('confirmation-status')).toHaveText('Server confirmed');
    await expect(page.getByTestId('confirmation-time')).toHaveText(/\d/);

    expect(calls.punchPosts).toHaveLength(1);
    const post = calls.punchPosts[0];
    expect(post.body.method).toBe('GPS');
    expect(post.body.eventId).toMatch(/^[0-9a-f]{16}$/);
    expect(post.body.idempotencyKey).toBe(post.body.eventId);
    expect(post.idempotencyKey).toBe(post.body.eventId);
    expect(post.authorization).toBe('Bearer access-e2e');
    expect(post.body.location).toMatchObject({ worksiteId: 'ws-1', withinGeofence: true });
    for (const forbidden of ['employeeId', 'status', 'attendanceType', 'receivedAt']) {
      expect(Object.keys(post.body)).not.toContain(forbidden);
    }
  });

  test('rejects an out-of-geofence punch locally without any submission', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation(FAR_AWAY);
    await loginMobile(page);
    const calls = await mockAttendanceApi(page);

    await page.goto('/attendance');
    await page.getByTestId('punch-action').click();

    await expect(page.getByTestId('punch-confirmation')).toHaveAttribute('data-kind', 'rejected');
    await expect(page.getByTestId('confirmation-reason')).toHaveText('Outside the authorized worksite area');
    await expect(page.getByTestId('confirmation-submitted')).toHaveText('No — blocked on this device');

    expect(calls.punchPosts).toHaveLength(0); // never submitted (BRD FR-03 REJECT policy)
    // the local rejection is preserved for the day view (FR-06 audit trail)
    await expect(page.getByTestId('today-item').first()).toHaveAttribute('data-source', 'local');
  });

  test('shows "Already recorded" when the server detects a duplicate', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation(HQ);
    await loginMobile(page);
    const calls = await mockAttendanceApi(page, {
      punch: (body) => ({
        status: 200,
        json: {
          success: true,
          data: {
            event: {
              id: body.eventId,
              attendanceType: 'CHECK_IN',
              method: 'GPS',
              status: 'DUPLICATE',
              recordedAt: '2026-10-22T08:00:01.000Z',
              receivedAt: '2026-10-22T08:00:01.000Z',
              worksite: { id: 'ws-1', name: ATTENDANCE_WORKSITE.name },
              distanceMeters: 12,
              rejectionReason: null,
              duplicateOfEventId: '1122334455667788',
            },
          },
        },
      }),
    });

    await page.goto('/attendance');
    await page.getByTestId('punch-action').click();

    await expect(page.getByTestId('punch-confirmation')).toHaveAttribute('data-kind', 'duplicate');
    await expect(page.getByTestId('confirmation-title')).toHaveText('Already recorded');
    await expect(page.getByText('1122334455667788')).toBeVisible();
    expect(calls.punchPosts).toHaveLength(1); // the replay still reached the server
  });

  test('queues the punch while offline and syncs on reconnect', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation(HQ);
    await loginMobile(page);

    // Load the screen first (config/worksites/status), THEN lose the network.
    const preCalls = await mockAttendanceApi(page);
    await page.goto('/attendance');
    await expect(page.getByTestId('punch-action')).toBeEnabled();
    expect(preCalls.configAuth.length).toBeGreaterThan(0);

    await page.unroute('**/api/mobile/v1/**');
    await page.route('**/api/mobile/v1/**', (route) => route.abort('connectionfailed'));

    await page.getByTestId('punch-action').click();

    await expect(page.getByTestId('punch-confirmation')).toHaveAttribute('data-kind', 'pending', { timeout: 15000 });
    await expect(page.getByTestId('pending-card')).toBeVisible();
    await expect(page.getByTestId('pending-count')).toHaveText('1');
    await expect(page.getByTestId('readiness-sync')).toHaveAttribute('data-state', 'pending');
    // still on the attendance page — no forced logout offline
    await expect(page.getByTestId('attendance-page')).toBeVisible();

    // Back online: restore the mock and fire the browser 'online' event.
    await mockEssApi(page);
    const calls = await mockAttendanceApi(page);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect(page.getByTestId('pending-card')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByTestId('readiness-sync')).toHaveAttribute('data-state', 'idle');
    expect(calls.punchPosts).toHaveLength(1); // drained on reconnect with the same event id/key
    expect(calls.punchPosts[0].idempotencyKey).toBe(calls.punchPosts[0].body.eventId);
  });

  test('returns to the login screen when the session cannot be refreshed', async ({ page }) => {
    await loginMobile(page);
    await page.goto('/attendance');
    await expect(page.getByTestId('attendance-page')).toBeVisible();

    // Backend starts rejecting everything, including the refresh.
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

    await page.goto('/attendance');
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });
  });

  test('explains when the camera cannot start for QR punching', async ({ page }) => {
    await loginMobile(page);
    const calls = await mockAttendanceApi(page);

    await page.goto('/attendance');
    await page.getByTestId('method-qr').click();
    await expect(page.getByTestId('punch-action')).toHaveText('Scan QR to punch');
    await page.getByTestId('punch-action').click();

    // CI has no camera — the scanner fails with guidance and no punch happens.
    await expect(page.getByTestId('attendance-capture-error')).toBeVisible({ timeout: 15000 });
    expect(calls.punchPosts).toHaveLength(0);
  });
});
