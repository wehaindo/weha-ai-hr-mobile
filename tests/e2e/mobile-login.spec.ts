import { expect, test, type Page } from '@playwright/test';
import { resetAppState } from './helpers/test-utils';

// Mobile auth (login against weha-framework) — the framework base URL is
// cross-origin, so every route answers CORS/preflight like the real API.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-name',
};

const SESSION = {
  accessToken: 'access-e2e',
  refreshToken: 'tenantid01.e2etoken',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    userId: 'u-1',
    employeeId: 'e-1',
    portalUserId: 'p-1',
    email: 'budi@example.com',
    name: 'Budi Santoso',
    tenantSlug: 'default',
  },
};

interface LoginOutcome {
  status: number;
  json: Record<string, unknown>;
}

interface MobileAuthRoutes {
  /** Bodies posted to /auth/login, in order. */
  loginCalls: Record<string, unknown>[];
  /** Bodies posted to /auth/logout, in order. */
  logoutCalls: Record<string, unknown>[];
}

async function mockMobileAuth(
  page: Page,
  handlers: {
    login?: () => LoginOutcome;
    otpRequest?: () => LoginOutcome;
    otpVerify?: () => LoginOutcome;
  } = {}
): Promise<MobileAuthRoutes> {
  const calls: MobileAuthRoutes = { loginCalls: [], logoutCalls: [] };

  await page.route('**/api/mobile/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const respond = (status: number, json: Record<string, unknown>) =>
      route.fulfill({
        status,
        headers: CORS_HEADERS,
        contentType: 'application/json',
        body: JSON.stringify(json),
      });

    const url = request.url();
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;

    if (url.includes('/auth/login')) {
      calls.loginCalls.push(body);
      const outcome = handlers.login?.() ?? { status: 200, json: { success: true, data: SESSION } };
      return respond(outcome.status, outcome.json);
    }
    if (url.includes('/auth/otp/request')) {
      const outcome =
        handlers.otpRequest?.() ?? { status: 200, json: { success: true, data: { sent: true, devCode: '246810' } } };
      return respond(outcome.status, outcome.json);
    }
    if (url.includes('/auth/otp/verify')) {
      const outcome = handlers.otpVerify?.() ?? { status: 200, json: { success: true, data: SESSION } };
      return respond(outcome.status, outcome.json);
    }
    if (url.includes('/auth/logout')) {
      calls.logoutCalls.push(body);
      return respond(200, { success: true, data: { revoked: true } });
    }
    return respond(404, { success: false, error: 'Not found' });
  });

  return calls;
}

async function openMobilePasswordForm(page: Page): Promise<void> {
  await page.getByTestId('toggle-mobile-login').click();
  await page.getByTestId('mobile-email').fill(SESSION.user.email);
  await page.getByTestId('mobile-password').fill('secret-password');
}

test.describe('mobile login (WEHA account)', () => {
  test('signs in with email + password and lands on the dashboard', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockMobileAuth(page);

    await openMobilePasswordForm(page);
    // optional tenant slug field (multi-tenant servers) is present and empty by default
    await expect(page.getByTestId('mobile-tenant')).toBeVisible();
    await page.getByTestId('mobile-submit').click();

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('page-title')).toHaveText('Dashboard');

    // the framework received the credentials verbatim (no tenant → omitted)
    expect(calls.loginCalls).toHaveLength(1);
    expect(calls.loginCalls[0]).toMatchObject({ email: SESSION.user.email, password: 'secret-password' });
    expect(calls.loginCalls[0]).not.toHaveProperty('tenantSlug');
  });

  test('remembers the tenant slug after a successful sign-in', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockMobileAuth(page);

    // type the tenant slug once
    await page.getByTestId('toggle-mobile-login').click();
    await page.getByTestId('mobile-email').fill(SESSION.user.email);
    await page.getByTestId('mobile-password').fill('secret-password');
    await page.getByTestId('mobile-tenant').fill('acme');
    await page.getByTestId('mobile-submit').click();

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    expect(calls.loginCalls[0]).toMatchObject({ tenantSlug: 'acme' });

    // sign out — the slug is a device setting, not a session, so it is kept
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });

    // reopen mobile login → the remembered slug is prefilled (type once)
    await page.getByTestId('toggle-mobile-login').click();
    await expect(page.getByTestId('mobile-tenant')).toHaveValue('acme');
  });

  test('rejects invalid credentials and shows the server message', async ({ page }) => {
    await resetAppState(page);
    await mockMobileAuth(page, {
      login: () => ({ status: 401, json: { success: false, error: 'Invalid email or password' } }),
    });

    await openMobilePasswordForm(page);
    await page.getByTestId('mobile-submit').click();

    await expect(page.getByTestId('mobile-error')).toHaveText('Invalid email or password');
    await expect(page.getByTestId('mobile-login-form')).toBeVisible();
  });

  test('switches to the code flow when the account has no mobile password', async ({ page }) => {
    await resetAppState(page);
    await mockMobileAuth(page, {
      login: () => ({
        status: 403,
        json: { success: false, error: 'otp_required', message: 'This account has no mobile password.' },
      }),
    });

    await openMobilePasswordForm(page);
    await page.getByTestId('mobile-submit').click();

    await expect(page.getByTestId('mobile-error')).toHaveText('This account has no mobile password.');
    await expect(page.getByTestId('mobile-toggle-password')).toBeVisible(); // now in OTP view
    await expect(page.getByTestId('mobile-otp')).toBeVisible();
  });

  test('signs in with an emailed one-time code', async ({ page }) => {
    await resetAppState(page);
    await mockMobileAuth(page);

    await page.getByTestId('toggle-mobile-login').click();
    await page.getByTestId('mobile-email').fill(SESSION.user.email);
    await page.getByTestId('mobile-toggle-otp').click();
    await page.getByTestId('mobile-send-code').click();

    await expect(page.getByTestId('mobile-code-sent')).toBeVisible();
    await expect(page.getByTestId('mobile-devcode')).toContainText('246810');

    await page.getByTestId('mobile-otp').fill('123456');
    await page.getByTestId('mobile-otp-submit').click();

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
  });

  test('logout revokes the session and returns to the login grid', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockMobileAuth(page);

    await openMobilePasswordForm(page);
    await page.getByTestId('mobile-submit').click();
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();

    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => calls.logoutCalls.length).toBe(1);
    expect(calls.logoutCalls[0].refreshToken).toBe(SESSION.refreshToken);
  });

  test('a mobile session survives a reload without re-authenticating', async ({ page }) => {
    await resetAppState(page);
    await mockMobileAuth(page);

    await openMobilePasswordForm(page);
    await page.getByTestId('mobile-submit').click();
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });

    await page.reload();
    // still authenticated — no login screen, dashboard shell present
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('user-menu')).toBeVisible();
  });
});
