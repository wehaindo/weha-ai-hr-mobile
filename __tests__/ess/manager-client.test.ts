import { describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { saveMobileSession } from '@/auth/mobile-session';
import { createEssManagerApi, EssApiError } from '@/integration/ess/manager';

const DASHBOARD = {
  teamCount: 8,
  pendingCount: 3,
  completed30d: 12,
  rejected30d: 1,
  overdueCount: 1,
  team: [
    {
      employeeId: 'e-1',
      name: 'Budi Santoso',
      department: 'Operations',
      todayAttendance: { status: 'PRESENT', checkIn: '08:01', checkOut: null },
      pendingCount: 1,
    },
    {
      employeeId: 'e-2',
      name: 'Sari Admin',
      department: 'Operations',
      todayAttendance: null, // not yet calculated
      pendingCount: 0,
    },
  ],
  salary: '99999999', // leak probe
  phone: '+628111',
};

async function makeApi(
  cloudImpl: (req: { url: string; method?: string; headers?: Record<string, string> }) => unknown
) {
  const { bridge } = await createFakeBridge();
  await saveMobileSession(bridge, {
    email: 'manager@example.com',
    tenant_slug: 'acme',
    access_token: 'test-access-token',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    identity_json: JSON.stringify({ userId: 'u1', employeeId: 'M1' }),
  });
  const request = vi.fn(cloudImpl);
  bridge.cloud.request = request as unknown as typeof bridge.cloud.request;
  const api = await createEssManagerApi(bridge);
  return { api, request };
}

const ok = (data: unknown) => () => ({ ok: true, status: 200, headers: {}, json: { success: true, data } });
const fail =
  (status: number, error: string, message?: string) =>
  () => ({ ok: false, status, headers: {}, json: { success: false, error, message } });

type CloudReq = Parameters<NonNullable<Parameters<typeof makeApi>[0]>>[0];

describe('EssManagerApi', () => {
  it('getDashboard GETs with the Bearer token, parses counts and strips non-whitelisted fields', async () => {
    const { api, request } = await makeApi(ok(DASHBOARD));

    const dashboard = await api.getDashboard();

    expect(dashboard.teamCount).toBe(8);
    expect(dashboard.pendingCount).toBe(3);
    expect(dashboard.overdueCount).toBe(1);
    expect(dashboard.team[0].todayAttendance?.status).toBe('PRESENT');
    expect(dashboard.team[1].todayAttendance).toBeNull();
    expect('salary' in dashboard).toBe(false);
    expect('phone' in dashboard).toBe(false);
    expect('salary' in dashboard.team[0]).toBe(false);

    const call = request.mock.calls[0][0] as CloudReq;
    expect(call.url).toContain('/api/mobile/v1/ess/manager/dashboard');
    expect(call.headers!['Authorization']).toBe('Bearer test-access-token');
  });

  it('getTeam passes search and cursor as server-side params', async () => {
    const { api, request } = await makeApi(
      ok({ team: [{ employeeId: 'e-1', name: 'Budi Santoso', department: 'Ops', todayAttendance: null, pendingCount: 0 }], nextCursor: 'c2' })
    );

    const page = await api.getTeam({ search: 'Budi', cursor: 'c1' });

    expect(page.team).toHaveLength(1);
    expect(page.nextCursor).toBe('c2');
    const call = request.mock.calls[0][0] as CloudReq;
    expect(call.url).toContain('/ess/manager/team?search=Budi&cursor=c1');
  });

  it('getTeam tolerates a missing cursor in the response', async () => {
    const { api } = await makeApi(ok({ team: [] }));
    const page = await api.getTeam();
    expect(page.team).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });

  it('getDelegations parses active windows and passes the scope', async () => {
    const { api, request } = await makeApi(
      ok({
        delegations: [
          {
            id: 'del-1',
            direction: 'INBOUND',
            counterpart: { id: 'e-9', name: 'Pak Boss' },
            startsAt: '2026-11-01T00:00:00.000Z',
            endsAt: '2026-11-07T23:59:59.000Z',
            formTypes: ['LEAVE'],
            isActive: true,
          },
        ],
      })
    );

    const delegations = await api.getDelegations('inbound');

    expect(delegations).toHaveLength(1);
    expect(delegations[0].counterpart.name).toBe('Pak Boss');
    expect(delegations[0].formTypes).toEqual(['LEAVE']);
    expect(request.mock.calls[0][0].url).toContain('/ess/delegations?scope=inbound');
  });

  it('throws session_expired when the access token and refresh both fail', async () => {
    const { api } = await makeApi((req) => {
      if (req.url.includes('/auth/refresh')) return fail(401, 'unauthorized')();
      return fail(401, 'unauthorized')();
    });

    const err = await api.getDashboard().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('session_expired');
  });

  it('fails loudly on contract drift', async () => {
    const { api } = await makeApi(ok({ teamCount: 'x' })); // wrong shape
    const err = await api.getDashboard().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('unavailable');
  });
});
