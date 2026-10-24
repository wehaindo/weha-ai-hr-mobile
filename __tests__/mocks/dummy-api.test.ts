import { beforeEach, describe, expect, it } from 'vitest';
import { matchDummyApi, resetDummyApi } from '@/mocks/dummy-api';
import type { CloudRequest } from '@/platform/bridge';

function req(overrides: Partial<CloudRequest> & { url: string }): CloudRequest {
  return { method: 'GET', headers: {}, ...overrides };
}

const BASE = 'http://localhost:3178/api/mobile/v1';

beforeEach(() => {
  resetDummyApi();
});

describe('ESS dummy API (NEXT_PUBLIC_ESS_DUMMY)', () => {
  it('passes through anything that is not an ESS mobile URL', async () => {
    expect(await matchDummyApi(req({ url: 'http://localhost:3178/api/device/PRODUCT' }))).toBeNull();
    expect(await matchDummyApi(req({ url: 'https://example.com/other' }))).toBeNull();
  });

  it('serves a dummy mobile session for login', async () => {
    const response = await matchDummyApi(req({ url: `${BASE}/auth/login`, method: 'POST', body: '{}' }));

    expect(response?.ok).toBe(true);
    const payload = response?.json as { success: boolean; data: { user: { email: string; employeeId: string } } };
    expect(payload.success).toBe(true);
    expect(payload.data.user.email).toBe('budi@example.com');
    expect(payload.data.user.employeeId).toBe('emp-001');
  });

  it('serves the employee profile with company/department relations', async () => {
    const response = await matchDummyApi(req({ url: `${BASE}/employees/me` }));
    const payload = response?.json as { data: { employee: { name: string; company: { name: string } } } };

    expect(payload.data.employee.name).toBe('Budi Santoso');
    expect(payload.data.employee.company.name).toBe('WEHA Retail');
  });

  it('resolves parameterized request details and falls back to the first fixture', async () => {
    const returned = await matchDummyApi(req({ url: `${BASE}/ess/requests/req-101` }));
    const body = returned?.json as { data: { request: { status: string } } };
    expect(body.data.request.status).toBe('RETURNED');

    const unknown = await matchDummyApi(req({ url: `${BASE}/ess/requests/nope` }));
    expect((unknown?.json as { data: { request: { status: string } } }).data.request.status).toBeTruthy();
  });

  it('a multipart submit echoes a projection AND appends it to the history list', async () => {
    const submission = await matchDummyApi(
      req({
        url: `${BASE}/ess/leave/requests`,
        method: 'POST',
        formData: [
          { name: 'request', value: JSON.stringify({ idempotencyKey: 'k1', leaveTypeId: 'lt_annual', startDate: '2026-12-07', endDate: '2026-12-09', halfDay: 'NONE', reason: 'Trip' }) },
          { name: 'files', filename: 'surat.pdf', bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' },
        ],
      })
    );

    const body = submission?.json as { data: { request: { status: string; requestNo: string; attachmentCount: number } } };
    expect(body.data.request.status).toBe('SUBMITTED');
    expect(body.data.request.requestNo).toMatch(/^ESS-REQ-2026-\d{6}$/);
    expect(body.data.request.attachmentCount).toBe(1);

    const list = await matchDummyApi(req({ url: `${BASE}/ess/requests` }));
    const items = (list?.json as { data: { requests: Array<{ reason: string }> } }).data.requests;
    expect(items[0].reason).toBe('Trip'); // overlay appended, newest first
  });

  it('filters the history by status (server-side contract)', async () => {
    const cancelled = await matchDummyApi(req({ url: `${BASE}/ess/requests?status=CANCELLED` }));
    const items = (cancelled?.json as { data: { requests: Array<{ status: string }> } }).data.requests;

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.status).toBe('CANCELLED');
  });

  it('an approval decision removes the item from the inbox', async () => {
    const before = await matchDummyApi(req({ url: `${BASE}/ess/approvals` }));
    const beforeItems = (before?.json as { data: { requests: unknown[] } }).data.requests;
    expect(beforeItems.length).toBe(2);

    const decision = await matchDummyApi(
      req({
        url: `${BASE}/ess/approvals/apr-001/decision`,
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVED', expectedVersion: 1 }),
      })
    );
    const result = (decision?.json as { data: { recordStatus: string; version: number } }).data;
    expect(result.recordStatus).toBe('APPROVED');
    expect(result.version).toBe(1);

    const after = await matchDummyApi(req({ url: `${BASE}/ess/approvals` }));
    const afterItems = (after?.json as { data: { requests: Array<{ requestId: string }> } }).data.requests;
    expect(afterItems).toHaveLength(1);
    expect(afterItems[0].requestId).toBe('apr-002');
  });

  it('approval detail carries the leave context fixture', async () => {
    const detail = await matchDummyApi(req({ url: `${BASE}/ess/approvals/apr-001` }));
    const data = (detail?.json as { data: { leaveContext: { balance: { available: number } } } }).data;

    expect(data.leaveContext.balance.available).toBe(5);
  });

  it('an attendance punch is accepted and flips the status', async () => {
    const punch = await matchDummyApi(
      req({
        url: `${BASE}/attendance/events`,
        method: 'POST',
        body: JSON.stringify({ eventId: 'aaaaaaaaaaaaaaa1', idempotencyKey: 'aaaaaaaaaaaaaaa1', method: 'GPS', capturedAt: '2026-10-23T08:00:00.000Z', location: { worksiteId: 'ws-hq', latitude: -6.2088, longitude: 106.8456, accuracyMeters: 8, distanceMeters: 12, withinGeofence: true } }),
      })
    );
    expect((punch?.json as { data: { event: { status: string } } }).data.event.status).toBe('ACCEPTED');

    const status = await matchDummyApi(req({ url: `${BASE}/attendance/status` }));
    const data = (status?.json as { data: { current: string; expectedNext: string; today: unknown[] } }).data;
    expect(data.current).toBe('PRESENT');
    expect(data.expectedNext).toBe('CHECK_OUT');
    expect(data.today).toHaveLength(1);
  });

  it('payroll amounts stay Decimal STRINGS (BRD Phase 5 §7)', async () => {
    const summary = await matchDummyApi(req({ url: `${BASE}/ess/payroll/summary` }));
    const data = (summary?.json as { data: { latest: { netSalary: unknown } } }).data;
    expect(typeof data.latest.netSalary).toBe('string');

    const payslip = await matchDummyApi(req({ url: `${BASE}/ess/payroll/periods/per-2026-09/payslip` }));
    const detail = (payslip?.json as { data: { payslip: { summary: { netSalary: unknown }; employerContributions: unknown[] } } }).data;
    expect(typeof detail.payslip.summary.netSalary).toBe('string');
    expect(detail.payslip.employerContributions.length).toBeGreaterThan(0);
  });

  it('unknown mobile paths fail loudly with a helpful 404', async () => {
    const response = await matchDummyApi(req({ url: `${BASE}/ess/nonexistent`, method: 'POST' }));

    expect(response?.status).toBe(404);
    const body = response?.json as { success: boolean; error: string; message: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('not_found');
    expect(body.message).toContain('/ess/nonexistent');
  });
});
