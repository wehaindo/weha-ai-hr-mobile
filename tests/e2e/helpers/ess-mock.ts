import type { Page } from '@playwright/test';

// Mocks the whole `/api/mobile/v1/*` surface used by Phase 2 ESS specs:
// auth (login/refresh/logout), profile GET/PATCH — CORS-aware like the real
// cross-origin framework API.

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-name',
};

export const MOBILE_SESSION = {
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

export const ESSENTIAL_EMPLOYEE = {
  id: 'e-1',
  employeeNumber: 'EMP-007',
  firstName: 'Budi',
  lastName: 'Santoso',
  name: null,
  email: 'budi@example.com',
  phone: '+628111111',
  status: 'ACTIVE',
  companyId: 'co-1',
  departmentId: 'dep-1',
  position: 'Store Supervisor',
  hireDate: '2023-06-01',
  company: { id: 'co-1', name: 'WEHA Retail' },
  department: { id: 'dep-1', name: 'Operations' },
};

export interface EssApiCalls {
  profileGets: (string | null)[];
  profilePatches: { body: Record<string, unknown>; authorization: string | null }[];
}

export async function mockEssApi(
  page: Page,
  handlers: {
    employee?: Record<string, unknown>;
    profileGet?: () => { status: number; json: Record<string, unknown> };
    refresh?: () => { status: number; json: Record<string, unknown> };
  } = {}
): Promise<EssApiCalls> {
  const calls: EssApiCalls = { profileGets: [], profilePatches: [] };
  const employee = handlers.employee ?? ESSENTIAL_EMPLOYEE;

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
    const auth = request.headers()['authorization'] ?? null;
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;

    if (url.includes('/auth/login')) {
      return respond(200, { success: true, data: MOBILE_SESSION });
    }
    if (url.includes('/auth/refresh')) {
      const outcome =
        handlers.refresh?.() ?? { status: 200, json: { success: true, data: { ...MOBILE_SESSION, accessToken: 'rotated' } } };
      return respond(outcome.status, outcome.json);
    }
    if (url.includes('/auth/logout')) {
      return respond(200, { success: true, data: { revoked: true } });
    }
    if (url.includes('/employees/me') && request.method() === 'GET') {
      calls.profileGets.push(auth);
      const outcome =
        handlers.profileGet?.() ?? { status: 200, json: { success: true, data: { employee } } };
      return respond(outcome.status, outcome.json);
    }
    if (url.includes('/employees/me') && request.method() === 'PATCH') {
      calls.profilePatches.push({ body, authorization: auth });
      return respond(200, { success: true, data: { employee: { ...employee, ...body } } });
    }
    return respond(404, { success: false, error: 'Not found' });
  });

  return calls;
}

export async function loginWithMobile(page: Page): Promise<void> {
  await page.getByTestId('toggle-mobile-login').click();
  await page.getByTestId('mobile-email').fill(MOBILE_SESSION.user.email);
  await page.getByTestId('mobile-password').fill('secret-password');
  await page.getByTestId('mobile-submit').click();
}
