import { describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { saveMobileSession } from '@/auth/mobile-session';
import {
  createEssRequestsApi,
  EssApiError,
  type LeaveSubmission,
} from '@/integration/ess/requests';

const LEAVE_SUBMISSION: LeaveSubmission = {
  idempotencyKey: 'aaaaaaaaaaaaaaa1',
  leaveTypeId: 'lt_annual',
  startDate: '2026-11-02',
  endDate: '2026-11-04',
  halfDay: 'NONE',
  reason: 'Family holiday',
};

const REQUEST = {
  id: 'req-1',
  requestNo: 'ESS-REQ-2026-000123',
  type: 'LEAVE',
  status: 'SUBMITTED',
  submittedAt: '2026-10-22T08:00:00.000Z',
  decidedAt: null,
  reason: 'Family holiday',
  workingDays: 3,
  expectedHours: null,
  period: { start: '2026-11-02', end: '2026-11-04', halfDay: 'NONE' },
  currentStepName: 'Direct manager',
  approverName: null,
  returnReason: null,
  attachmentCount: 0,
};

async function makeApi(
  cloudImpl: (req: {
    url: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    formData?: Array<{ name: string; value?: string; filename?: string }>;
  }) => unknown
) {
  const { bridge } = await createFakeBridge();
  await saveMobileSession(bridge, {
    email: 'budi@example.com',
    tenant_slug: 'acme',
    access_token: 'test-access-token',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    identity_json: JSON.stringify({ userId: 'u1', employeeId: 'E1' }),
  });
  const request = vi.fn(cloudImpl);
  bridge.cloud.request = request as unknown as typeof bridge.cloud.request;
  const api = await createEssRequestsApi(bridge);
  return { api, request };
}

type CloudReq = Parameters<NonNullable<Parameters<typeof makeApi>[0]>>[0];

const ok = (data: unknown) => () => ({ ok: true, status: 200, headers: {}, json: { success: true, data } });
const fail =
  (status: number, error: string, message?: string) =>
  (): { ok: false; status: number; headers: Record<string, never>; json: { success: false; error: string; message?: string } } => ({
    ok: false,
    status,
    headers: {},
    json: { success: false, error, message },
  });

describe('EssRequestsApi', () => {
  it('getLeaveTypes GETs the config with the Bearer token and coerces decimals', async () => {
    const { api, request } = await makeApi(
      ok({
        types: [
          { id: 'lt1', code: 'ANNUAL', name: 'Annual', unit: 'DAYS', halfDayAllowed: true, requiresAttachment: false, consumesBalance: true, maxConsecutiveDays: '14' },
        ],
        permissionTypes: [{ code: 'sick', name: 'Sick', requiresAttachment: false, consumesBalance: true, isTimed: false }],
      })
    );

    const config = await api.getLeaveTypes();

    expect(config.types[0].maxConsecutiveDays).toBe(14);
    expect(config.permissionTypes[0].code).toBe('sick');
    const call = request.mock.calls[0][0] as { url: string; headers: Record<string, string> };
    expect(call.url).toContain('/api/mobile/v1/ess/leave/types');
    expect(call.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('submitLeave sends ONE multipart call: request JSON part + Idempotency-Key header', async () => {
    const { api, request } = await makeApi(ok({ request: REQUEST }));

    const result = await api.submitLeave(LEAVE_SUBMISSION);

    expect(result.requestNo).toBe('ESS-REQ-2026-000123');
    expect(result.status).toBe('SUBMITTED');
    const call = request.mock.calls[0][0] as CloudReq & {
      formData: Array<{ name: string; value?: string; filename?: string }>;
    };
    expect(call.url).toContain('/api/mobile/v1/ess/leave/requests');
    expect(call.method).toBe('POST');
    expect(call.headers!['Idempotency-Key']).toBe('aaaaaaaaaaaaaaa1');
    expect(call.body).toBeUndefined(); // multipart carries no raw body
    expect(call.formData).toHaveLength(1);
    expect(call.formData[0].name).toBe('request');
    const payload = JSON.parse(call.formData[0].value ?? '{}') as Record<string, unknown>;
    expect(payload).toEqual(LEAVE_SUBMISSION);
    for (const forbidden of ['employeeId', 'status', 'requestNo', 'workingDays', 'decidedAt']) {
      expect(Object.keys(payload)).not.toContain(forbidden);
    }
  });

  it('submitLeave appends file parts and never exceeds the contract shape', async () => {
    const { api, request } = await makeApi(ok({ request: REQUEST }));

    await api.submitLeave(LEAVE_SUBMISSION, [
      { filename: 'surat.pdf', bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' },
    ]);

    const call = request.mock.calls[0][0] as CloudReq & { formData: Array<{ name: string; filename?: string }> };
    expect(call.formData).toHaveLength(2);
    expect(call.formData[1]).toMatchObject({ name: 'files', filename: 'surat.pdf' });
  });

  it('submits the other three types to their contract paths', async () => {
    const { api, request } = await makeApi(ok({ request: { ...REQUEST, type: 'PERMISSION' } }));

    await api.submitPermission({ idempotencyKey: 'k1', permissionCode: 'sick', date: '2026-10-30', reason: 'flu' });
    await api.submitOvertime({
      idempotencyKey: 'k2', date: '2026-10-28', startTime: '18:00', endTime: '21:00',
      reason: 'Stock opname', workDescription: 'Counting', locationText: 'Warehouse',
    });
    await api.submitCorrection({
      idempotencyKey: 'k3', attendanceDate: '2026-10-27', requestedTime: '07:58',
      originalTime: '08:00', explanation: 'Scanner down',
    });

    const urls = request.mock.calls.map((c) => (c[0] as CloudReq).url);
    expect(urls[0]).toContain('/ess/permission/requests');
    expect(urls[1]).toContain('/ess/overtime/requests');
    expect(urls[2]).toContain('/ess/attendance-corrections');
  });

  it('maps domain failures (409 overlap) with the raw domain code', async () => {
    const { api } = await makeApi(fail(409, 'overlap', 'You already have leave covering those days.'));

    const err = await api.submitLeave(LEAVE_SUBMISSION).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).status).toBe(409);
    expect((err as EssApiError).code).toBe('conflict');
    expect((err as EssApiError).domainCode).toBe('overlap');
  });

  it('maps validation failures (400 attachment_required) with the domain code', async () => {
    const { api } = await makeApi(fail(400, 'attachment_required', 'This leave type needs a document.'));

    const err = await api.submitLeave(LEAVE_SUBMISSION).catch((e: unknown) => e);

    expect((err as EssApiError).code).toBe('validation');
    expect((err as EssApiError).domainCode).toBe('attachment_required');
  });

  it('listRequests passes filters as query params', async () => {
    const { api, request } = await makeApi(ok({ requests: [REQUEST] }));

    const list = await api.listRequests({ status: 'IN_REVIEW', type: 'LEAVE', limit: 10 });

    expect(list).toHaveLength(1);
    const call = request.mock.calls[0][0] as CloudReq;
    expect(call.url).toContain('/ess/requests?status=IN_REVIEW&type=LEAVE&limit=10');
  });

  it('cancel, resubmit and decision round-trip typed results', async () => {
    const { api, request } = await makeApi((req) => {
      if (req.url.includes('/decision')) {
        return ok({ requestId: 'req-1', action: 'APPROVED', recordStatus: 'APPROVED', version: 1, nextStepName: null })();
      }
      if (req.url.includes('/resubmit')) return ok({ request: { ...REQUEST, status: 'IN_REVIEW' } })();
      return ok({ request: { ...REQUEST, status: 'CANCELLED' } })();
    });

    const cancelled = await api.cancelRequest('req-1', 'plans changed');
    expect(cancelled.status).toBe('CANCELLED');

    const resubmitted = await api.resubmitRequest('req-1', LEAVE_SUBMISSION);
    expect(resubmitted.status).toBe('IN_REVIEW');

    const decision = await api.decide('req-1', { action: 'APPROVED', notes: 'OK', expectedVersion: 1 }, 'idem-key-1');
    expect(decision.action).toBe('APPROVED');
    expect(decision.recordStatus).toBe('APPROVED');
    expect(decision.version).toBe(1);

    const decisionCall = request.mock.calls[2][0] as CloudReq;
    expect(decisionCall.url).toContain('/ess/approvals/req-1/decision');
    expect(JSON.parse(decisionCall.body ?? '{}')).toEqual({ action: 'APPROVED', notes: 'OK', expectedVersion: 1 });
    expect(decisionCall.headers!['Idempotency-Key']).toBe('idem-key-1');
  });

  it('maps a stale version to version_conflict (409)', async () => {
    const { api } = await makeApi(fail(409, 'version_conflict', 'This request changed.'));

    const err = await api
      .decide('req-1', { action: 'APPROVED', expectedVersion: 1 }, 'idem-key-2')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).domainCode).toBe('version_conflict');
    expect((err as EssApiError).status).toBe(409);
  });

  it('getInbox sends filters + cursor and parses the page with stripped fields', async () => {
    const { api, request } = await makeApi(
      ok({
        requests: [
          {
            requestId: 'req-9', recordId: 'lr-9', requestNo: 'ESS-REQ-2026-000009', type: 'LEAVE',
            employee: { id: 'E2', name: 'Sari', department: 'Ops' },
            submittedAt: '2026-10-20T01:00:00.000Z',
            period: { start: '2026-11-02', end: '2026-11-04', halfDay: 'NONE' },
            reason: 'Trip', currentStepName: 'Direct manager', ageDays: '4', hasAttachments: true,
            overdue: true, version: 2,
            salary: '9999999',
          },
        ],
        nextCursor: 'cursor-2',
      })
    );

    const page = await api.getInbox({ formType: 'LEAVE', overdue: true, q: 'Sari' }, 'cursor-1');

    expect(page.items).toHaveLength(1);
    expect(page.items[0].ageDays).toBe(4);
    expect(page.items[0].overdue).toBe(true);
    expect(page.items[0].version).toBe(2);
    expect(page.items[0].recordId).toBe('lr-9');
    expect('salary' in page.items[0]).toBe(false);
    expect(page.nextCursor).toBe('cursor-2');
    const call = request.mock.calls[0][0] as CloudReq;
    expect(call.url).toContain('/ess/approvals?formType=LEAVE&overdue=true&q=Sari&cursor=cursor-1');
  });

  it('parses leave and correction approval contexts from the detail', async () => {
    const { api } = await makeApi(
      ok({
        request: {
          id: 'req-100', requestNo: 'ESS-REQ-2026-000100', type: 'LEAVE', status: 'SUBMITTED',
          submittedAt: '2026-10-20T01:00:00.000Z', reason: 'Trip', workingDays: 3,
          period: { start: '2026-11-02', end: '2026-11-04', halfDay: 'NONE' },
          attachmentCount: 1, attachments: [{ id: 'att-1', fileName: 'surat.pdf', mimeType: 'application/pdf', size: 100 }],
          timeline: [{ stepName: 'Direct manager', action: 'PENDING', createdAt: '2026-10-20T01:00:00.000Z', correlationId: 'corr-1' }],
        },
        employee: { id: 'E2', name: 'Sari', department: 'Ops' },
        recordId: 'lr-100',
        version: 3,
        availableActions: ['APPROVED', 'REJECTED', 'RETURNED'],
        leaveContext: {
          leaveType: 'Annual leave', startDate: '2026-11-02', endDate: '2026-11-04', requestedDays: 3,
          balance: { entitled: '12.00', used: '6.00', pending: '1.00', available: '5.00' },
          overlapping: [{ requestNo: 'ESS-REQ-2026-000050', start: '2026-11-03', end: '2026-11-03', status: 'APPROVED' }],
        },
        correctionContext: null,
      })
    );

    const detail = await api.getApproval('req-100');

    expect(detail.version).toBe(3);
    expect(detail.availableActions).toEqual(['APPROVED', 'REJECTED', 'RETURNED']);
    expect(detail.leaveContext?.balance.available).toBe(5); // decimal strings coerced
    expect(detail.leaveContext?.overlapping[0].status).toBe('APPROVED');
    expect(detail.request.attachments).toHaveLength(1);
    expect(detail.request.timeline?.[0].correlationId).toBe('corr-1');
    expect(detail.correctionContext).toBeNull();
    expect('salary' in detail).toBe(false);
  });

  it('parses a correction context with the original punch evidence', async () => {
    const { api } = await makeApi(
      ok({
        request: {
          id: 'req-101', requestNo: 'ESS-REQ-2026-000101', type: 'ATTENDANCE_CORRECTION', status: 'SUBMITTED',
          submittedAt: '2026-10-20T01:00:00.000Z', reason: 'Scanner down', attachmentCount: 0,
        },
        employee: { id: 'E2', name: 'Sari' },
        recordId: 'ac-101',
        version: 1,
        correctionContext: {
          workDate: '2026-10-27', correctionType: 'CHECK_IN',
          before: { checkIn: null }, after: { checkIn: '07:58' },
          attendance: { status: 'INCOMPLETE', checkIn: null, checkOut: null },
          originalPunch: { punchAt: '2026-10-27T08:00:11Z', punchType: 'CHECK_IN', source: 'DEVICE', dedupeKey: 'dk-1' },
          schedule: { shiftName: 'Morning' },
          flags: ['possible_duplicate'],
        },
      })
    );

    const detail = await api.getApproval('req-101');

    expect(detail.correctionContext?.originalPunch?.punchAt).toBe('2026-10-27T08:00:11Z');
    expect(detail.correctionContext?.flags).toEqual(['possible_duplicate']);
    expect(detail.correctionContext?.after).toEqual({ checkIn: '07:58' });
    expect(detail.leaveContext).toBeUndefined();
  });

  it('throws session_expired when the access token and refresh both fail', async () => {
    const { api } = await makeApi((req) => {
      if (req.url.includes('/auth/refresh')) return fail(401, 'unauthorized')();
      return fail(401, 'unauthorized')();
    });
    const err = await api.listRequests().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('session_expired');
  });

  it('reports network failures as isNetwork without logging out', async () => {
    const { api } = await makeApi(() => {
      throw new Error('fetch failed');
    });
    const err = await api.getBalances().catch((e: unknown) => e);

    expect((err as EssApiError).isNetwork).toBe(true);
  });

  it('fails loudly on contract drift', async () => {
    const { api } = await makeApi(ok({ requests: [{ id: 'x' }] })); // missing required fields
    const err = await api.listRequests().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('unavailable');
  });
});
