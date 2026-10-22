import { describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { saveMobileSession } from '@/auth/mobile-session';
import { createEssApiClient, EssApiClient, EssApiError, essEmployeeSchema } from '@/integration/ess/client';
import type { MobileAuthClient } from '@/integration/mobile-auth/client';

const EMPLOYEE = {
  id: 'E1',
  employeeNumber: 'EMP-001',
  firstName: 'Alif',
  lastName: 'Rahman',
  name: null,
  email: 'alif@weha.example',
  phone: '+628111',
  status: 'ACTIVE',
  companyId: 'co-1',
  departmentId: 'dep-1',
  position: 'Cashier',
  hireDate: '2024-01-15',
};

async function makeClient(
  cloudImpl: (req: { url: string; method?: string; body?: string; headers?: Record<string, string> }) => unknown
) {
  const { bridge } = await createFakeBridge();
  await saveMobileSession(bridge, {
    email: 'alif@weha.example',
    tenant_slug: 'acme',
    access_token: 'test-access-token',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // > 5-min skew → no proactive refresh
    identity_json: JSON.stringify({ userId: 'u1', employeeId: 'E1', email: 'alif@weha.example' }),
  });
  const request = vi.fn(cloudImpl);
  bridge.cloud.request = request as unknown as typeof bridge.cloud.request;
  const client = await createEssApiClient(bridge);
  return { client, request };
}

const ok = (data: unknown) => ({ ok: true, status: 200, headers: {}, json: { success: true, data } });
const fail = (status: number, error: string, message?: string) => ({
  ok: false,
  status,
  headers: {},
  json: { success: false, error, message },
});

describe('EssApiClient', () => {
  it('GETs /employees/me with the refreshed Bearer token', async () => {
    const { client, request } = await makeClient(() => ok({ employee: EMPLOYEE }));
    const employee = await client.getProfile();

    expect(employee.id).toBe('E1');
    const call = request.mock.calls[0][0] as { url: string; headers: Record<string, string> };
    expect(call.url).toContain('/api/mobile/v1/employees/me');
    expect(call.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('strips sensitive/unknown response fields before they reach state', async () => {
    const { client } = await makeClient(() =>
      ok({ employee: { ...EMPLOYEE, salary: '9999999', nik: '1234567890', bankAccountNumber: '111' } })
    );
    const employee = await client.getProfile();

    expect('salary' in employee).toBe(false);
    expect('nik' in employee).toBe(false);
    expect('bankAccountNumber' in employee).toBe(false);
  });

  it('PATCH sends only allowlisted fields and never an employee id', async () => {
    const { client, request } = await makeClient(() => ok({ employee: { ...EMPLOYEE, phone: '0899' } }));
    const updated = await client.updateProfile({ phone: '0899' });

    expect(updated.phone).toBe('0899');
    const call = request.mock.calls[0][0] as { url: string; method?: string; body?: string };
    expect(call.method).toBe('PATCH');
    const body = JSON.parse(call.body ?? '{}') as Record<string, unknown>;
    expect(body).toEqual({ phone: '0899' });
    expect(Object.keys(body)).not.toContain('id');
    expect(Object.keys(body)).not.toContain('employeeId');
  });

  it('rejects an empty patch without touching the network', async () => {
    const { client, request } = await makeClient(() => ok({ employee: EMPLOYEE }));
    const err = await client.updateProfile({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('validation');
    expect(request).not.toHaveBeenCalled();
  });

  it('maps envelope conflict (409) to a typed error', async () => {
    const { client } = await makeClient(() =>
      fail(409, 'conflict', 'That email is already used by another employee.')
    );
    const err = await client.updateProfile({ email: 'taken@weha.example' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('conflict');
    expect((err as EssApiError).status).toBe(409);
  });

  it('recovers once via token refresh when the access token is rejected', async () => {
    let profileCalls = 0;
    const { client } = await makeClient((req) => {
      if (req.url.includes('/auth/refresh')) {
        return ok({
          accessToken: 'rotated-token',
          refreshToken: 'refresh-2',
          tokenType: 'Bearer',
          expiresIn: 900,
        });
      }
      profileCalls += 1;
      if (profileCalls === 1) return fail(401, 'unauthorized');
      return ok({ employee: EMPLOYEE });
    });

    const employee = await client.getProfile();
    expect(employee.id).toBe('E1');
    expect(profileCalls).toBe(2);
  });

  it('throws session_expired when refresh cannot recover the 401', async () => {
    const { client } = await makeClient((req) => {
      if (req.url.includes('/auth/refresh')) return fail(401, 'unauthorized');
      return fail(401, 'unauthorized');
    });
    const err = await client.getProfile().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('session_expired');
  });

  it('reports network failures as isNetwork without logging out', async () => {
    const { client } = await makeClient(() => {
      throw new Error('fetch failed');
    });
    const err = await client.getProfile().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).isNetwork).toBe(true);
    expect((err as EssApiError).isSessionExpired).toBe(false);
  });

  it('fails with no_employee_session when no session row exists', async () => {
    const { bridge } = await createFakeBridge();
    const client = new EssApiClient(bridge, {} as MobileAuthClient);

    const err = await client.getProfile().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('no_employee_session');
  });
});

describe('essEmployeeSchema', () => {
  it('requires an id and tolerates nullable optional fields', () => {
    expect(essEmployeeSchema.safeParse({ id: 'E1' }).success).toBe(true);
    expect(essEmployeeSchema.safeParse({ employeeNumber: 'X' }).success).toBe(false);
  });
});
