// Dummy ESS API (NEXT_PUBLIC_ESS_DUMMY=1) — answers `/api/mobile/v1/*`
// calls from src/mocks/ess-dummy-data.json so every screen can be previewed
// before weha-ai-hrd is ready. Contract-compatible envelope
// (docs/ESS-API-REFERENCE.md §0); unknown paths fail loudly with 404.
// Turning the flag OFF (default) means this module is never loaded — the
// JSON stays out of the bundle (dynamic import behind the flag).

import type { CloudRequest, CloudResponse } from '@/platform/bridge';

type Json = Record<string, unknown>;

interface Fixture {
  session: Json;
  authMe: Json;
  employee: Json;
  attendance: {
    config: Json;
    worksites: Json[];
    status: { current: string; expectedNext: string | null; today: Json[]; serverTime: string };
    events: Json[];
  };
  leave: { types: Json[]; permissionTypes: Json[]; balances: Json[]; preview: Json };
  requests: Json[];
  approvals: {
    items: Json[];
    leaveContextByRequest: Record<string, Json>;
    correctionContextByRequest: Record<string, Json>;
    delegations: Json[];
  };
  manager: { dashboard: Json };
  payroll: {
    summary: Json;
    periods: Json[];
    payslip: Json;
    payments: Json[];
    documents: Json[];
    inquiries: Json[];
  };
}

let fixturePromise: Promise<{ fixture: Fixture; state: Overlay }> | null = null;

/** Forget the cached fixture + overlay state (used by tests). */
export function resetDummyApi(): void {
  fixturePromise = null;
}

interface Overlay {
  requests: Json[];
  approvals: Json[];
  today: Json[];
  inquiries: Json[];
  seq: number;
}

async function load(): Promise<{ fixture: Fixture; state: Overlay }> {
  if (!fixturePromise) {
    fixturePromise = import('./ess-dummy-data.json').then((module) => {
      const fixture = (module as { default: Fixture }).default;
      const state: Overlay = {
        requests: [...fixture.requests],
        approvals: [...fixture.approvals.items],
        today: [...fixture.attendance.status.today],
        inquiries: [...fixture.payroll.inquiries],
        seq: 600,
      };
      return { fixture, state };
    });
  }
  return fixturePromise;
}

function json(status: number, body: Json): CloudResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    json: body,
  };
}

const ok = (data: unknown): CloudResponse => json(200, { success: true, data });
const fail = (status: number, error: string, message: string): CloudResponse =>
  json(status, { success: false, error, message });

function bodyJson(req: CloudRequest): Json {
  const part = req.formData?.find((p) => p.name === 'request');
  const raw = part?.value ?? req.body;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return {};
  }
}

function dummyFile(fileName: string, contentType: string, text: string): Json {
  return { base64: btoa(text), fileName, mimeType: contentType };
}

function nextRequestNo(seq: number): string {
  return `ESS-REQ-2026-${String(seq).padStart(6, '0')}`;
}

function submittedProjection(path: string, body: Json, seq: number, attachmentCount = 0): Json {
  const type = path.includes('leave/requests')
    ? 'LEAVE'
    : path.includes('permission')
      ? 'PERMISSION'
      : path.includes('overtime')
        ? 'OVERTIME'
        : 'ATTENDANCE_CORRECTION';
  const period =
    type === 'LEAVE'
      ? { start: body.startDate ?? null, end: body.endDate ?? null, halfDay: body.halfDay ?? 'NONE' }
      : type === 'ATTENDANCE_CORRECTION'
        ? { date: body.attendanceDate ?? null }
        : { date: body.date ?? null, startTime: body.startTime ?? null, endTime: body.endTime ?? null, halfDay: null };
  return {
    id: `req-dummy-${seq}`,
    requestNo: nextRequestNo(seq),
    type,
    status: 'SUBMITTED',
    submittedAt: new Date().toISOString(),
    decidedAt: null,
    reason: (body.reason as string) ?? (body.explanation as string) ?? null,
    workingDays: type === 'LEAVE' ? 3 : null,
    expectedHours: type === 'OVERTIME' ? 2 : null,
    period,
    payload: body,
    currentStepName: 'Direct manager',
    approverName: null,
    returnReason: null,
    attachmentCount,
    attachments:
      attachmentCount > 0
        ? [{ id: `att-dummy-${seq}`, fileName: 'uploaded.pdf', mimeType: 'application/pdf', size: 184320 }]
        : [],
    timeline: [],
    originalRequestNo: null,
  };
}

function attendanceEventFor(body: Json): Json {
  const location = (body.location ?? {}) as Json;
  return {
    id: (body.eventId as string) ?? 'dummy-event',
    attendanceType: 'CHECK_IN',
    method: (body.method as string) ?? 'GPS',
    status: 'ACCEPTED',
    recordedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    worksite: { id: 'ws-hq', name: 'WEHA Retail — HQ Jakarta' },
    distanceMeters: location.distanceMeters ?? 12,
    rejectionReason: null,
    duplicateOfEventId: null,
  };
}

function approvalDetail(item: Json, fixture: Fixture): Json {
  const requestId = String(item.requestId);
  return {
    request: {
      id: requestId,
      requestNo: item.requestNo,
      type: item.type,
      status: item.status,
      submittedAt: item.submittedAt,
      decidedAt: null,
      reason: item.reason ?? null,
      workingDays: item.workingDays ?? null,
      expectedHours: item.expectedHours ?? null,
      period: item.period ?? null,
      currentStepName: item.currentStepName ?? null,
      approverName: item.approverName ?? null,
      returnReason: item.returnReason ?? null,
      attachmentCount: item.attachmentCount ?? 0,
      attachments: item.attachments ?? [],
      timeline: item.timeline ?? [],
      originalRequestNo: null,
    },
    employee: item.employee,
    previousRequestCount: 4,
    recordId: item.recordId,
    version: item.version ?? 1,
    availableActions: item.availableActions ?? ['APPROVED', 'REJECTED', 'RETURNED'],
    leaveContext: fixture.approvals.leaveContextByRequest[requestId] ?? null,
    correctionContext: fixture.approvals.correctionContextByRequest[requestId] ?? null,
  };
}

function listRequests(state: Overlay, params: URLSearchParams): Json[] {
  const status = params.get('status');
  const type = params.get('type');
  return state.requests.filter((req) => {
    if (status && req.status !== status) return false;
    if (type && req.type !== type) return false;
    return true;
  });
}

/**
 * Match a cloud request against the dummy fixtures. Returns null for
 * anything that is not an ESS mobile URL (pass through to the network).
 */
export async function matchDummyApi(req: CloudRequest): Promise<CloudResponse | null> {
  if (!req.url.includes('/api/mobile/v1/')) return null;

  const { fixture, state } = await load();
  const url = new URL(req.url);
  const path = url.pathname.split('/api/mobile/v1')[1] ?? '/';
  const method = (req.method ?? 'GET').toUpperCase();
  const params = url.searchParams;

  // ── Auth / profile ───────────────────────────────────────────────────────
  if (path === '/auth/login' || path === '/auth/otp/verify') return ok(fixture.session);
  if (path === '/auth/otp/request') return ok({ sent: true, devCode: '123456' });
  if (path === '/auth/refresh') return ok(fixture.session);
  if (path === '/auth/logout') return ok({ revoked: true });
  if (path === '/auth/me') return ok(fixture.authMe);
  if (path === '/employees/me') return ok({ employee: fixture.employee });

  // ── Attendance ───────────────────────────────────────────────────────────
  if (path === '/attendance/config') return ok(fixture.attendance.config);
  if (path === '/attendance/worksites') return ok({ worksites: fixture.attendance.worksites });
  if (path === '/attendance/status') {
    const hasCheckIn = state.today.length > 0;
    return ok({
      current: hasCheckIn ? 'PRESENT' : fixture.attendance.status.current,
      expectedNext: hasCheckIn ? 'CHECK_OUT' : fixture.attendance.status.expectedNext,
      today: state.today,
      serverTime: fixture.attendance.status.serverTime,
    });
  }
  if (path === '/attendance/events' && method === 'POST') {
    const event = attendanceEventFor(bodyJson(req));
    state.today.push(event);
    return ok({ event, serverTime: fixture.attendance.status.serverTime });
  }
  if (path === '/attendance/events/sync' && method === 'POST') {
    const body = bodyJson(req);
    const events = (body.events as Json[] | undefined) ?? [];
    return ok({ results: events.map((entry) => attendanceEventFor(entry)), serverTime: fixture.attendance.status.serverTime });
  }
  if (path === '/attendance/events') return ok({ events: state.today, serverTime: fixture.attendance.status.serverTime });
  if (path.startsWith('/attendance/events/')) return ok({ event: state.today[0] ?? attendanceEventFor({}) });

  // ── Leave / requests ─────────────────────────────────────────────────────
  if (path === '/ess/leave/types') return ok({ types: fixture.leave.types, permissionTypes: fixture.leave.permissionTypes });
  if (path === '/ess/leave/balances') return ok({ balances: fixture.leave.balances });
  if (path === '/ess/leave/requests/preview') return ok(fixture.leave.preview);

  if (method === 'POST' && /^\/ess\/(leave|permission|overtime|attendance-corrections)/.test(path)) {
    if (path.includes('/preview')) return ok(fixture.leave.preview);
    const body = bodyJson(req);
    const fileCount = req.formData ? req.formData.filter((p) => p.name === 'files').length : 0;
    const projection = submittedProjection(path, body, state.seq++, fileCount);
    state.requests.unshift(projection);
    return ok({ request: projection, serverTime: new Date().toISOString() });
  }

  if (path === '/ess/requests' && method === 'GET') return ok({ requests: listRequests(state, params) });

  if (path.startsWith('/ess/requests/')) {
    const rest = path.slice('/ess/requests/'.length); // ":id(/sub)?"
    const [id, action] = rest.split('/');

    if (action === 'cancel' && method === 'POST') {
      const target = state.requests.find((r) => r.id === id) ?? state.requests[0];
      if (target) {
        target.status = 'CANCELLED';
        target.returnReason = (bodyJson(req).reason as string) ?? null;
      }
      return ok({ request: target });
    }
    if (action === 'resubmit' && method === 'POST') {
      const target = state.requests.find((r) => r.id === id) ?? state.requests[0];
      if (target) {
        target.status = 'IN_REVIEW';
        target.returnReason = null;
        target.version = ((target.version as number) ?? 1) + 1;
        const part = req.formData?.find((p) => p.name === 'request');
        if (part?.value) {
          try {
            const corrected = JSON.parse(part.value) as Json;
            if (typeof corrected.reason === 'string') target.reason = corrected.reason;
            if (typeof corrected.explanation === 'string') target.reason = corrected.explanation;
          } catch {
            /* keep the original */
          }
        }
      }
      return ok({ request: target });
    }
    if (action === 'attachments') {
      const [, , attachmentId] = rest.split('/');
      return ok({ file: dummyFile(`attachment-${attachmentId ?? 'file'}.pdf`, 'application/pdf', '%PDF-1.4 dummy attachment') });
    }
    if (action === 'history') {
      const target = state.requests.find((r) => r.id === id) ?? state.requests[0];
      return ok({ history: target?.timeline ?? [] });
    }
    const target = state.requests.find((r) => r.id === id) ?? state.requests[0];
    if (!target) return fail(404, 'not_found', 'Request not found.');
    return ok({ request: target });
  }

  // ── Approvals (manager) ─────────────────────────────────────────────────
  if (path === '/ess/approvals' && method === 'GET') {
    const formType = params.get('formType');
    const overdueOnly = params.get('overdue') === 'true';
    const q = (params.get('q') ?? '').toLowerCase();
    const filtered = state.approvals.filter((item) => {
      if (formType && item.type !== formType) return false;
      if (overdueOnly && item.overdue !== true) return false;
      if (q) {
        const employee = item.employee as Json | undefined;
        const haystack = `${String(employee?.name ?? '')} ${String(item.requestNo ?? '')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return ok({ requests: filtered, nextCursor: null });
  }
  if (path.startsWith('/ess/approvals/') && path.endsWith('/decision') && method === 'POST') {
    const requestId = path.slice('/ess/approvals/'.length, path.length - '/decision'.length);
    const body = bodyJson(req);
    const action = String(body.action ?? 'APPROVED');
    const item = state.approvals.find((entry) => entry.requestId === requestId);
    if (item) state.approvals = state.approvals.filter((entry) => entry.requestId !== requestId);
    const recordStatus = action === 'APPROVED' ? 'APPROVED' : action === 'RETURNED' ? 'RETURNED' : 'REJECTED';
    return ok({ requestId, action, recordStatus, version: (item?.version as number) ?? 1, nextStepName: null });
  }
  if (path.startsWith('/ess/approvals/')) {
    const requestId = path.slice('/ess/approvals/'.length);
    const item = state.approvals.find((entry) => entry.requestId === requestId) ?? state.approvals[0];
    if (!item) return fail(404, 'not_found', 'Approval request not found.');
    return ok(approvalDetail(item, fixture));
  }
  if (path === '/ess/delegations') return ok({ delegations: fixture.approvals.delegations });

  // ── Manager dashboard ───────────────────────────────────────────────────
  if (path === '/ess/manager/dashboard') return ok(fixture.manager.dashboard);
  if (path === '/ess/manager/team') {
    const dashboard = fixture.manager.dashboard as { team: Json[] };
    const search = (params.get('search') ?? '').toLowerCase();
    const team = search
      ? dashboard.team.filter((member) => String(member.name ?? '').toLowerCase().includes(search))
      : dashboard.team;
    return ok({ team, nextCursor: null });
  }

  // ── Payroll ─────────────────────────────────────────────────────────────
  if (path === '/ess/payroll/summary') return ok(fixture.payroll.summary);
  if (path === '/ess/payroll/periods') return ok({ periods: fixture.payroll.periods });
  if (path === '/ess/payroll/payments') return ok({ payments: fixture.payroll.payments });
  if (path === '/ess/payroll/documents' && !path.includes('download')) return ok({ documents: fixture.payroll.documents });
  if (path.endsWith('/payslip/pdf')) return ok({ file: dummyFile('PAYSLIP-2026-000912.pdf', 'application/pdf', '%PDF-1.4 dummy payslip') });
  if (path.endsWith('/download')) return ok({ file: dummyFile('document.pdf', 'application/pdf', '%PDF-1.4 dummy document') });
  if (path.includes('/payslip')) return ok({ payslip: fixture.payroll.payslip });

  if (path === '/ess/payroll/inquiries' && method === 'GET') return ok({ inquiries: state.inquiries });
  if (path === '/ess/payroll/inquiries' && method === 'POST') {
    const body = bodyJson(req);
    const inquiry: Json = {
      inquiryId: `inq-dummy-${state.seq}`,
      number: `PAYINQ-2026-${String(state.seq++).padStart(6, '0')}`,
      category: body.category ?? 'OTHER',
      periodId: body.periodId ?? null,
      periodLabel: null,
      subject: body.subject ?? '',
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
      resolvedAt: null,
      attachmentCount: req.formData ? req.formData.filter((p) => p.name === 'files').length : 0,
      attachments: [],
      messages: [],
    };
    state.inquiries.unshift(inquiry);
    return ok({ inquiry });
  }
  if (path.startsWith('/ess/payroll/inquiries/') && path.endsWith('/messages') && method === 'POST') {
    const inquiryId = path.slice('/ess/payroll/inquiries/'.length, path.length - '/messages'.length);
    const inquiry = state.inquiries.find((entry) => entry.inquiryId === inquiryId) ?? state.inquiries[0];
    if (!inquiry) return fail(404, 'not_found', 'Inquiry not found.');
    const messages = (inquiry.messages as Json[] | undefined) ?? [];
    inquiry.messages = [
      ...messages,
      { authorRole: 'EMPLOYEE', authorName: 'Budi Santoso', message: String(bodyJson(req).message ?? ''), createdAt: new Date().toISOString() },
    ];
    return ok({ inquiry });
  }
  if (path.startsWith('/ess/payroll/inquiries/')) {
    const inquiryId = path.slice('/ess/payroll/inquiries/'.length);
    const inquiry = state.inquiries.find((entry) => entry.inquiryId === inquiryId) ?? state.inquiries[0];
    if (!inquiry) return fail(404, 'not_found', 'Inquiry not found.');
    return ok({ inquiry });
  }

  // ── Honest gap: unknown mobile path ─────────────────────────────────────
  return fail(404, 'not_found', `No dummy fixture for ${method} ${path} — add it to src/mocks/ess-dummy-data.json.`);
}
