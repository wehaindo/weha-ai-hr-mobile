import type { Page, Route } from '@playwright/test';
import { CORS_HEADERS } from './ess-mock';

// Mocks `/api/mobile/v1/ess/*` (contract: docs/ESS-REQUESTS-CONTRACT.md) with
// a small STATEFUL model: submits/cancels/resubmits/decisions mutate the
// request list the list endpoint serves. Register AFTER mockEssApi.

export interface MockRequestRecord {
  id: string;
  requestNo: string;
  type: 'LEAVE' | 'PERMISSION' | 'OVERTIME' | 'ATTENDANCE_CORRECTION' | 'LEAVE_CANCELLATION';
  status: 'SUBMITTED' | 'IN_REVIEW' | 'RETURNED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  submittedAt: string;
  decidedAt?: string | null;
  reason?: string | null;
  workingDays?: number | null;
  expectedHours?: number | null;
  period?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  currentStepName?: string | null;
  approverName?: string | null;
  returnReason?: string | null;
  attachmentCount: number;
  attachments?: Array<{ id: string; fileName: string; mimeType: string | null; size: number }>;
  timeline?: Array<{ stepName: string; action: string; actorName: string | null; notes: string | null; createdAt: string }>;
  originalRequestNo?: string | null;
}

export const LEAVE_TYPE = {
  id: 'lt_annual',
  code: 'ANNUAL',
  name: 'Annual leave',
  unit: 'DAYS',
  halfDayAllowed: true,
  requiresAttachment: false,
  consumesBalance: true,
  maxConsecutiveDays: null,
};

export const PERMISSION_TYPES = [
  { code: 'sick', name: 'Sick leave', requiresAttachment: false, consumesBalance: true, isTimed: false },
  { code: 'late', name: 'Late arrival', requiresAttachment: false, consumesBalance: false, isTimed: true },
];

export const BALANCES = [
  { leaveTypeId: 'lt_annual', code: 'ANNUAL', name: 'Annual leave', unit: 'DAYS', period: '2026', entitled: 12, used: 6, pending: 1, available: 5 },
];

export function seedRequests(): MockRequestRecord[] {
  return [
    {
      id: 'req-100',
      requestNo: 'ESS-REQ-2026-000100',
      type: 'LEAVE',
      status: 'SUBMITTED',
      submittedAt: '2026-10-20T01:00:00.000Z',
      reason: 'Family holiday',
      workingDays: 3,
      expectedHours: null,
      period: { start: '2026-11-02', end: '2026-11-04', halfDay: 'NONE' },
      payload: { leaveTypeId: 'lt_annual' },
      currentStepName: 'Direct manager',
      approverName: null,
      returnReason: null,
      attachmentCount: 1,
      attachments: [{ id: 'att-1', fileName: 'surat.pdf', mimeType: 'application/pdf', size: 12345 }],
      timeline: [],
    },
    {
      id: 'req-101',
      requestNo: 'ESS-REQ-2026-000101',
      type: 'PERMISSION',
      status: 'RETURNED',
      submittedAt: '2026-10-18T03:00:00.000Z',
      reason: 'Doctor visit',
      workingDays: null,
      expectedHours: null,
      period: { date: '2026-10-24' },
      payload: { permissionCode: 'sick' },
      currentStepName: 'Direct manager',
      approverName: 'Sari Admin',
      returnReason: 'Please attach the sick note.',
      attachmentCount: 0,
      timeline: [
        { stepName: 'Direct manager', action: 'RETURNED', actorName: 'Sari Admin', notes: 'Please attach the sick note.', createdAt: '2026-10-19T02:00:00.000Z' },
      ],
    },
    {
      id: 'req-102',
      requestNo: 'ESS-REQ-2026-000102',
      type: 'OVERTIME',
      status: 'APPROVED',
      submittedAt: '2026-10-10T05:00:00.000Z',
      decidedAt: '2026-10-11T05:00:00.000Z',
      reason: 'Stock opname',
      workingDays: null,
      expectedHours: 3,
      period: { date: '2026-10-14', startTime: '18:00', endTime: '21:00' },
      payload: { workDescription: 'Counting stock' },
      currentStepName: null,
      approverName: 'Sari Admin',
      returnReason: null,
      attachmentCount: 0,
      timeline: [{ stepName: 'Direct manager', action: 'APPROVED', actorName: 'Sari Admin', notes: 'OK', createdAt: '2026-10-11T05:00:00.000Z' }],
    },
  ];
}

export interface RequestsMockCalls {
  submits: Array<{ url: string; idempotencyKey: string | null; requestJson: Record<string, unknown> | null; multipart: string }>;
  cancels: Array<{ url: string; body: Record<string, unknown> }>;
  resubmits: Array<{ url: string; multipart: string }>;
  decisions: Array<{ url: string; body: Record<string, unknown>; authorization: string | null; idempotencyKey: string | null }>;
  downloads: number;
  /** Inbox list requests (path + query) for filter/pagination assertions. */
  listQueries: string[];
}

export interface RequestsMockOptions {
  requests?: MockRequestRecord[];
  inbox?: unknown[];
  /** Override the approval detail projection (contexts, version, …). */
  approvalDetail?: Record<string, unknown>;
  /** Delegations served at GET /ess/delegations. */
  delegations?: unknown[];
  /** Force every decision to answer 409 version_conflict. */
  decisionConflict?: boolean;
  /** Override the submit outcome (e.g. force a domain error). */
  submit?: (json: Record<string, unknown>) => { status: number; json: Record<string, unknown> } | null;
}

export async function mockRequestsApi(page: Page, options: RequestsMockOptions = {}): Promise<{ calls: RequestsMockCalls }> {
  const calls: RequestsMockCalls = { submits: [], cancels: [], resubmits: [], decisions: [], downloads: 0, listQueries: [] };
  const requests = options.requests ?? seedRequests();
  let inbox = options.inbox ?? [
    {
      requestId: 'req-200',
      recordId: 'ot-200',
      version: 1,
      availableActions: ['APPROVED', 'REJECTED', 'RETURNED'],
      requestNo: 'ESS-REQ-2026-000200',
      type: 'OVERTIME',
      employee: { id: 'E2', name: 'Sari Admin', department: 'Operations' },
      submittedAt: '2026-10-20T01:00:00.000Z',
      period: { date: '2026-10-25', startTime: '18:00', endTime: '20:00' },
      reason: 'Month-end close',
      currentStepName: 'Direct manager',
      ageDays: 2,
      hasAttachments: false,
      overdue: false,
    },
  ];
  let nextId = 300;
  let counter = 500;

  await page.route('**/api/mobile/v1/ess/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const respond = (status: number, json: Record<string, unknown>) =>
      route.fulfill({ status, headers: CORS_HEADERS, contentType: 'application/json', body: JSON.stringify(json) });

    const url = request.url();
    const auth = request.headers()['authorization'] ?? null;

    function parseRequestPart(postData: string): Record<string, unknown> | null {
      const match = postData.match(/name="request"[\r\n]+[\r\n]+(\{[\s\S]*?\})[\r\n]+--/);
      if (!match) return null;
      try {
        return JSON.parse(match[1]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    // ── Approvals (Phase 6: /ess/approvals + filters + cursor) ────────────
    if (url.includes('/ess/approvals/') && url.includes('/decision')) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      calls.decisions.push({
        url,
        body,
        authorization: auth,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
      });
      const requestId = url.match(/approvals\/([^/]+)\/decision/)?.[1] ?? '';
      const action = String(body.action ?? 'APPROVED');
      const inboxList = inbox as Array<Record<string, unknown> & { requestId: string }>;
      const item = inboxList.find((entry) => entry.requestId === requestId);
      if (options.decisionConflict || (body.expectedVersion !== undefined && item && item.version !== body.expectedVersion)) {
        return respond(409, { success: false, error: 'version_conflict', message: 'This request changed.' });
      }
      inbox = inboxList.filter((entry) => entry.requestId !== requestId);
      const target = requests.find((r) => r.id === requestId);
      if (target) {
        target.status = action === 'APPROVED' ? 'APPROVED' : action === 'RETURNED' ? 'RETURNED' : 'REJECTED';
        target.decidedAt = '2026-10-22T09:00:00.000Z';
        target.timeline = [
          ...(target.timeline ?? []),
          { stepName: 'Direct manager', action, actorName: 'Sari Admin', notes: (body.notes as string) ?? null, createdAt: '2026-10-22T09:00:00.000Z' },
        ];
      }
      return respond(200, {
        success: true,
        data: {
          requestId,
          action,
          recordStatus: target?.status ?? action,
          version: (item?.version as number) ?? 1,
          nextStepName: null,
        },
      });
    }

    if (url.includes('/ess/delegations')) {
      return respond(200, {
        success: true,
        data: {
          delegations: options.delegations ?? [
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
        },
      });
    }

    // inbox list — server-side filters + opaque cursor (contract §4.3)
    if (/\/ess\/approvals(\?|$)/.test(url)) {
      const parsedUrl = new URL(url);
      calls.listQueries.push(`${parsedUrl.pathname}${parsedUrl.search}`);
      const list = inbox as Array<Record<string, unknown>>;
      const formType = parsedUrl.searchParams.get('formType');
      const overdueOnly = parsedUrl.searchParams.get('overdue') === 'true';
      const q = (parsedUrl.searchParams.get('q') ?? '').toLowerCase();
      const cursor = parsedUrl.searchParams.get('cursor');

      let filtered = list.filter((item) => {
        if (formType && item.type !== formType) return false;
        if (overdueOnly && item.overdue !== true) return false;
        if (q) {
          const haystack = `${String((item.employee as { name?: string })?.name ?? '')} ${item.requestNo}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
      let nextCursor: string | null = null;
      if (cursor === 'page-2') {
        filtered = filtered.slice(1);
      } else if (filtered.length > 1) {
        filtered = filtered.slice(0, 1);
        nextCursor = 'page-2';
      }
      return respond(200, { success: true, data: { requests: filtered, nextCursor } });
    }

    if (url.includes('/ess/approvals/')) {
      const requestId = url.match(/approvals\/([^/?]+)$/)?.[1] ?? '';
      const inboxList = inbox as Array<Record<string, unknown> & { requestId: string; requestNo: string }>;
      const inboxItem = inboxList.find((item) => item.requestId === requestId);
      if (inboxItem) {
        // Serve the detail from the inbox item (it is pending, not yet in history)
        return respond(200, {
          success: true,
          data: {
            ...{
              recordId: inboxItem.recordId ?? `${inboxItem.requestId}-record`,
              version: inboxItem.version ?? 1,
              availableActions: inboxItem.availableActions ?? ['APPROVED', 'REJECTED', 'RETURNED'],
            },
            ...(options.approvalDetail ?? {}),
            request: {
              id: inboxItem.requestId,
              requestNo: inboxItem.requestNo,
              type: inboxItem.type,
              status: 'SUBMITTED',
              submittedAt: inboxItem.submittedAt,
              reason: inboxItem.reason ?? null,
              workingDays: null,
              expectedHours: null,
              period: inboxItem.period ?? null,
              currentStepName: inboxItem.currentStepName ?? null,
              returnReason: null,
              attachmentCount: inboxItem.hasAttachments ? 1 : 0,
              attachments: inboxItem.hasAttachments
                ? [{ id: 'att-200', fileName: 'surat.pdf', mimeType: 'application/pdf', size: 1234 }]
                : [],
              timeline: [],
              ...(options.approvalDetail?.request as Record<string, unknown> | undefined),
            },
            employee: inboxItem.employee,
            previousRequestCount: 4,
          },
        });
      }
      const target = requests.find((r) => r.id === requestId) ?? requests[0];
      return respond(200, {
        success: true,
        data: { request: target ?? {}, employee: { id: 'E2', name: 'Sari Admin', department: 'Operations' }, previousRequestCount: 4 },
      });
    }

    // Configuration
    if (url.includes('/ess/leave/types')) {
      return respond(200, { success: true, data: { types: [LEAVE_TYPE], permissionTypes: PERMISSION_TYPES } });
    }
    if (url.includes('/ess/leave/balances')) {
      return respond(200, { success: true, data: { balances: BALANCES } });
    }
    if (url.includes('/ess/leave/requests/preview')) {
      return respond(200, { success: true, data: { workingDays: 3, overlap: false, available: 5 } });
    }

    // Resubmit / cancel (POST, before the generic submit branch)
    if (url.includes('/ess/requests/') && url.includes('/resubmit')) {
      const postData = request.postData() ?? '';
      calls.resubmits.push({ url, multipart: postData });
      const requestId = url.match(/requests\/([^/]+)\/resubmit/)?.[1] ?? '';
      const target = requests.find((r) => r.id === requestId);
      if (target) {
        target.status = 'IN_REVIEW';
        target.returnReason = null;
      }
      return respond(200, { success: true, data: { request: target ?? {} } });
    }
    if (url.includes('/ess/requests/') && url.includes('/cancel')) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      calls.cancels.push({ url, body });
      const requestId = url.match(/requests\/([^/]+)\/cancel/)?.[1] ?? '';
      const target = requests.find((r) => r.id === requestId);
      if (target) target.status = 'CANCELLED';
      return respond(200, { success: true, data: { request: target ?? {} } });
    }

    // Submissions (multipart)
    if (request.method() === 'POST' && url.includes('/ess/') && url.includes('/requests')) {
      const postData = request.postData() ?? '';
      const json = parseRequestPart(postData);
      calls.submits.push({
        url,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
        requestJson: json,
        multipart: postData,
      });

      const override = options.submit?.(json ?? {});
      if (override) return respond(override.status, override.json);

      const type: MockRequestRecord['type'] = url.includes('leave')
        ? 'LEAVE'
        : url.includes('permission')
          ? 'PERMISSION'
          : url.includes('overtime')
            ? 'OVERTIME'
            : 'ATTENDANCE_CORRECTION';
      const record: MockRequestRecord = {
        id: `req-${nextId++}`,
        requestNo: `ESS-REQ-2026-000${counter++}`,
        type,
        status: 'SUBMITTED',
        submittedAt: '2026-10-22T08:00:00.000Z',
        reason: (json?.reason as string) ?? (json?.explanation as string) ?? null,
        workingDays: type === 'LEAVE' ? 3 : null,
        expectedHours: type === 'OVERTIME' ? 3 : null,
        period: type === 'LEAVE' ? { start: json?.startDate, end: json?.endDate, halfDay: json?.halfDay } : { date: json?.date ?? json?.attendanceDate, startTime: json?.startTime, endTime: json?.endTime },
        payload: json ?? {},
        currentStepName: 'Direct manager',
        returnReason: null,
        attachmentCount: postData.includes('filename=') ? 1 : 0,
        timeline: [],
      };
      requests.unshift(record);
      return respond(200, { success: true, data: { request: record, serverTime: '2026-10-22T08:00:00.000Z' } });
    }

    // Own history + detail + attachments
    if (url.includes('/ess/requests/') && url.includes('/attachments/')) {
      calls.downloads += 1;
      return respond(200, { success: true, data: { file: { base64: btoa('%PDF-1.4 mock'), fileName: 'surat.pdf', mimeType: 'application/pdf' } } });
    }
    if (url.includes('/ess/requests/')) {
      const requestId = url.match(/requests\/([^/?]+)$/)?.[1] ?? '';
      const target = requests.find((r) => r.id === requestId);
      return respond(200, { success: true, data: { request: target ?? requests[0] } });
    }
    if (url.includes('/ess/requests')) {
      // Server-side filtering (contract §4): ?status and ?type narrow the list.
      const parsed = new URL(url);
      const status = parsed.searchParams.get('status');
      const type = parsed.searchParams.get('type');
      const filtered = requests.filter(
        (r) => (!status || r.status === status) && (!type || r.type === type)
      );
      return respond(200, { success: true, data: { requests: filtered } });
    }

    return route.fallback();
  });

  return { calls };
}
