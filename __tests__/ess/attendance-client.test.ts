import { describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { saveMobileSession } from '@/auth/mobile-session';
import {
  createEssAttendanceApi,
  type AttendanceSubmission,
  EssApiError,
} from '@/integration/ess/attendance';
import type { MobileAuthClient } from '@/integration/mobile-auth/client';

const SUBMISSION: AttendanceSubmission = {
  eventId: 'aaaaaaaaaaaaaaa1',
  idempotencyKey: 'aaaaaaaaaaaaaaa1',
  method: 'GPS',
  capturedAt: '2026-10-22T08:01:59.000Z',
  location: {
    worksiteId: 'ws-1',
    latitude: -6.20881,
    longitude: 106.84562,
    accuracyMeters: 12,
    distanceMeters: 34.5,
    withinGeofence: true,
  },
};

const EVENT_RESULT = {
  id: 'aaaaaaaaaaaaaaa1',
  attendanceType: 'CHECK_IN',
  method: 'GPS',
  status: 'ACCEPTED',
  recordedAt: '2026-10-22T08:02:15.000Z',
  receivedAt: '2026-10-22T08:02:01.220Z',
  worksite: { id: 'ws-1', name: 'WEHA Retail — Branch Jakarta' },
  distanceMeters: 34.5,
  rejectionReason: null,
  duplicateOfEventId: null,
};

async function makeApi(
  cloudImpl: (req: { url: string; method?: string; body?: string; headers?: Record<string, string> }) => unknown
) {
  const { bridge } = await createFakeBridge();
  await saveMobileSession(bridge, {
    email: 'budi@example.com',
    tenant_slug: 'acme',
    access_token: 'test-access-token',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // > 5-min skew → no proactive refresh
    identity_json: JSON.stringify({ userId: 'u1', employeeId: 'E1', email: 'budi@example.com' }),
  });
  const request = vi.fn(cloudImpl);
  bridge.cloud.request = request as unknown as typeof bridge.cloud.request;
  const api = await createEssAttendanceApi(bridge);
  return { api, request };
}

const ok = (data: unknown) => ({ ok: true, status: 200, headers: {}, json: { success: true, data } });
const fail = (status: number, error: string, message?: string) => ({
  ok: false,
  status,
  headers: {},
  json: { success: false, error, message },
});

describe('EssAttendanceApi', () => {
  it('getConfig GETs /attendance/config with the Bearer token', async () => {
    const { api, request } = await makeApi(() =>
      ok({
        methods: ['GPS', 'QR'],
        policy: {
          duplicateIntervalSeconds: 120,
          offlineAllowed: true,
          geofencePolicy: 'REJECT',
          maxAccuracyMeters: 100,
        },
        serverTime: '2026-10-22T08:00:00.000Z',
      })
    );

    const config = await api.getConfig();

    expect(config.methods).toEqual(['GPS', 'QR']);
    expect(config.policy.offlineAllowed).toBe(true);
    const call = request.mock.calls[0][0] as { url: string; headers: Record<string, string> };
    expect(call.url).toContain('/api/mobile/v1/attendance/config');
    expect(call.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('submitEvent sends Idempotency-Key equal to the body key and never an employee id/status/type', async () => {
    const { api, request } = await makeApi(() => ok({ event: EVENT_RESULT }));

    const result = await api.submitEvent(SUBMISSION);

    expect(result.status).toBe('ACCEPTED');
    expect(result.attendanceType).toBe('CHECK_IN');
    const call = request.mock.calls[0][0] as { url: string; method?: string; body?: string; headers: Record<string, string> };
    expect(call.url).toContain('/api/mobile/v1/attendance/events');
    expect(call.method).toBe('POST');
    expect(call.headers['Idempotency-Key']).toBe('aaaaaaaaaaaaaaa1');
    const body = JSON.parse(call.body ?? '{}') as Record<string, unknown>;
    expect(body.idempotencyKey).toBe('aaaaaaaaaaaaaaa1');
    expect(Object.keys(body)).not.toContain('employeeId');
    expect(Object.keys(body)).not.toContain('status');
    expect(Object.keys(body)).not.toContain('attendanceType');
    expect(Object.keys(body)).not.toContain('receivedAt');
  });

  it('parses a DUPLICATE result with the original event reference (FR-06 replay)', async () => {
    const { api } = await makeApi(() =>
      ok({
        event: {
          ...EVENT_RESULT,
          status: 'DUPLICATE',
          duplicateOfEventId: 'aaaaaaaaaaaaaaa1',
        },
      })
    );

    const result = await api.submitEvent(SUBMISSION);

    expect(result.status).toBe('DUPLICATE');
    expect(result.duplicateOfEventId).toBe('aaaaaaaaaaaaaaa1');
  });

  it('parses REJECTED results as data, not transport errors', async () => {
    const { api } = await makeApi(() =>
      ok({
        event: {
          ...EVENT_RESULT,
          status: 'REJECTED',
          attendanceType: 'CHECK_IN',
          recordedAt: null,
          rejectionReason: 'outside_geofence',
        },
      })
    );

    const result = await api.submitEvent(SUBMISSION);

    expect(result.status).toBe('REJECTED');
    expect(result.rejectionReason).toBe('outside_geofence');
    expect(result.recordedAt).toBeNull();
  });

  it('tolerates a null attendanceType on server-rejected events', async () => {
    const { api } = await makeApi(() =>
      ok({
        event: {
          ...EVENT_RESULT,
          status: 'REJECTED',
          attendanceType: null,
          recordedAt: null,
          rejectionReason: 'duplicate_interval',
          duplicateOfEventId: null,
        },
      })
    );

    const result = await api.submitEvent(SUBMISSION);

    expect(result.status).toBe('REJECTED');
    expect(result.attendanceType).toBeNull();
    expect(result.rejectionReason).toBe('duplicate_interval');
  });

  it('parses a status payload whose rejected today-event has a null attendanceType', async () => {
    const { api } = await makeApi(() =>
      ok({
        current: 'PRESENT',
        expectedNext: 'CHECK_OUT',
        today: [
          { ...EVENT_RESULT },
          {
            ...EVENT_RESULT,
            id: 'bbbbbbbbbbbbbbbb',
            attendanceType: null,
            status: 'REJECTED',
            recordedAt: null,
            rejectionReason: 'duplicate_interval',
          },
        ],
        serverTime: '2026-10-25T03:47:07.063Z',
      })
    );

    const status = await api.getStatus();

    expect(status.current).toBe('PRESENT');
    expect(status.today).toHaveLength(2);
    expect(status.today[1].attendanceType).toBeNull();
    expect(status.today[1].rejectionReason).toBe('duplicate_interval');
  });

  it('syncEvents returns per-event results in order and coerces decimal strings', async () => {
    const { api, request } = await makeApi(() =>
      ok({
        results: [
          { ...EVENT_RESULT },
          {
            ...EVENT_RESULT,
            id: 'bbbbbbbbbbbbbbbb',
            status: 'REJECTED',
            recordedAt: null,
            rejectionReason: 'invalid_qr',
            distanceMeters: '12.5', // Prisma Decimal may serialize as a string
          },
        ],
      })
    );

    const results = await api.syncEvents([SUBMISSION, { ...SUBMISSION, eventId: 'bbbbbbbbbbbbbbbb' }]);

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('ACCEPTED');
    expect(results[1].status).toBe('REJECTED');
    expect(results[1].distanceMeters).toBeCloseTo(12.5);
    const call = request.mock.calls[0][0] as { url: string; body?: string };
    expect(call.url).toContain('/attendance/events/sync');
    const body = JSON.parse(call.body ?? '{}') as { events: unknown[] };
    expect(body.events).toHaveLength(2);
  });

  it('strips unknown response fields before they reach state', async () => {
    const { api } = await makeApi(() =>
      ok({ event: { ...EVENT_RESULT, salary: '9999999', employeeId: 'OTHER' } })
    );

    const result = await api.submitEvent(SUBMISSION);

    expect('salary' in result).toBe(false);
    expect('employeeId' in result).toBe(false);
  });

  it('maps contract drift to a loud unavailable error', async () => {
    const { api } = await makeApi(() => ok({ event: { id: 'x' } })); // missing required fields
    const err = await api.submitEvent(SUBMISSION).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('unavailable');
    expect((err as EssApiError).status).toBe(500);
  });

  it('maps 429 to rate_limited without logging out', async () => {
    const { api } = await makeApi(() => fail(429, 'rate_limited', 'Too many attempts.'));
    const err = await api.submitEvent(SUBMISSION).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('rate_limited');
    expect((err as EssApiError).isSessionExpired).toBe(false);
  });

  it('throws session_expired when the access token and refresh both fail', async () => {
    const { api } = await makeApi((req) => {
      if (req.url.includes('/auth/refresh')) return fail(401, 'unauthorized');
      return fail(401, 'unauthorized');
    });
    const err = await api.getStatus().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('session_expired');
  });

  it('reports network failures as isNetwork without logging out', async () => {
    const { api } = await makeApi(() => {
      throw new Error('fetch failed');
    });
    const err = await api.getConfig().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).isNetwork).toBe(true);
    expect((err as EssApiError).isSessionExpired).toBe(false);
  });

  it('fails with no_employee_session when no session row exists', async () => {
    const { bridge } = await createFakeBridge();
    const api = new (await import('@/integration/ess/attendance')).EssAttendanceApi(
      bridge,
      {} as MobileAuthClient
    );

    const err = await api.getStatus().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('no_employee_session');
  });
});
