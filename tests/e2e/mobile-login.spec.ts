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

/** Complete the first-run tenant setup if it is shown (no slug saved yet). */
async function completeTenantSetup(page: Page, slug = 'default'): Promise<void> {
  const setup = page.getByTestId('tenant-setup-form');
  try {
    await setup.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    return; // slug already saved → the login form shows directly
  }
  await page.getByTestId('tenant-setup-input').fill(slug);
  await page.getByTestId('tenant-setup-save').click();
  await setup.waitFor({ state: 'hidden' });
}

async function openMobilePasswordForm(page: Page, slug = 'default'): Promise<void> {
  await page.getByTestId('toggle-mobile-login').click();
  await completeTenantSetup(page, slug);
  await page.getByTestId('mobile-email').fill(SESSION.user.email);
  await page.getByTestId('mobile-password').fill('secret-password');
}

test.describe('mobile login (WEHA account)', () => {
  test('first run asks for the tenant slug, then signs in with email + password', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockMobileAuth(page);

    await openMobilePasswordForm(page, 'default');
    // the tenant field is prefilled with the slug saved during setup
    await expect(page.getByTestId('mobile-tenant')).toBeVisible();
    await page.getByTestId('mobile-submit').click();

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('page-title')).toHaveText('Dashboard');

    expect(calls.loginCalls).toHaveLength(1);
    expect(calls.loginCalls[0]).toMatchObject({
      email: SESSION.user.email,
      password: 'secret-password',
      tenantSlug: 'default',
    });
  });

  test('first run shows the tenant setup step before the login form', async ({ page }) => {
    await resetAppState(page);
    await mockMobileAuth(page);

    await page.getByTestId('toggle-mobile-login').click();

    // setup first — the login form is not reachable until a slug is saved
    await expect(page.getByTestId('tenant-setup-form')).toBeVisible();
    await expect(page.getByTestId('mobile-email')).toHaveCount(0);
    await expect(page.getByTestId('tenant-setup-save')).toBeDisabled(); // required

    await page.getByTestId('tenant-setup-input').fill('acme');
    await expect(page.getByTestId('tenant-setup-save')).toBeEnabled();
    await page.getByTestId('tenant-setup-save').click();

    // now the login form appears with the slug prefilled
    await expect(page.getByTestId('mobile-login-form')).toBeVisible();
    await expect(page.getByTestId('mobile-tenant')).toHaveValue('acme');
  });

  test('remembers the tenant slug after a successful sign-in', async ({ page }) => {
    await resetAppState(page);
    const calls = await mockMobileAuth(page);

    // setup saves the slug and reaches the login form
    await openMobilePasswordForm(page, 'acme');
    await page.getByTestId('mobile-submit').click();

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
    expect(calls.loginCalls[0]).toMatchObject({ tenantSlug: 'acme' });

    // sign out — the slug is a device setting, not a session, so it is kept
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('user-grid')).toBeVisible({ timeout: 30000 });

    // reopen mobile login → slug is saved, so setup is skipped and the form is prefilled
    await page.getByTestId('toggle-mobile-login').click();
    await expect(page.getByTestId('tenant-setup-form')).toHaveCount(0);
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
    await completeTenantSetup(page);
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
