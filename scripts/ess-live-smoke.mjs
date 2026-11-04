#!/usr/bin/env node
// Live ESS API smoke test against a real weha-ai-hrd deployment.
// Walks every endpoint the mobile client uses (reads by default, writes opt-in):
//
//   node scripts/ess-live-smoke.mjs \
//     [--base https://hrd.weha-id.com] [--tenant store-003] \
//     [--email user@example.com] [--password secret] [--write]
//
// --write additionally exercises: GPS punch (+idempotent replay), leave
// submit (then cancel). Business rejections (409/403/400) are reported as
// outcomes, not failures — exit code 1 only for connectivity/auth problems.

const args = process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur === '--write') return { ...acc, write: true };
  if (cur.startsWith('--')) return { ...acc, [cur.slice(2)]: arr[i + 1] };
  return acc;
}, {});

const BASE = String(args.base ?? process.env.BASE_URL ?? 'https://hrd.weha-id.com').replace(/\/+$/, '');
const TENANT = args.tenant ?? process.env.TENANT ?? 'store-003';
const EMAIL = args.email ?? process.env.EMAIL ?? 'whidayat@store003.com';
const PASSWORD = args.password ?? process.env.PASSWORD ?? 'password';
const WRITE = !!args.write || process.env.WRITE === '1';
const API = `${BASE}/api/mobile/v1`;

let accessToken = '';
let refreshToken = '';
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function raw(method, path, { body, headers = {}, auth = true } = {}) {
  const h = { ...headers };
  if (auth && accessToken) h.Authorization = `Bearer ${accessToken}`;
  let payload;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${API}${path}`, { method, headers: h, body: payload, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

const errOf = (r) => {
  const m = r?.json?.message ?? r?.json?.error;
  return m ?? (r?.text || '').slice(0, 200);
};

async function refreshIfNeeded() {
  if (!refreshToken) return false;
  const r = await raw('POST', '/auth/refresh', { body: { refreshToken }, auth: false });
  if (r.status === 200 && r.json?.data?.accessToken) {
    accessToken = r.json.data.accessToken;
    refreshToken = r.json.data.refreshToken ?? refreshToken;
    return true;
  }
  return false;
}

async function call(method, path, opts = {}) {
  let r = await raw(method, path, opts);
  if (r.status === 401 && (await refreshIfNeeded())) r = await raw(method, path, opts);
  return r;
}

async function multipart(path, fields) {
  const form = new FormData();
  form.append('request', JSON.stringify(fields));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': fields.idempotencyKey },
      body: form,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

const hex = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

async function main() {
  console.log(`\nESS live smoke — ${BASE} · tenant=${TENANT} · user=${EMAIL} · writes=${WRITE ? 'ON' : 'off'}\n`);

  // ── AUTH ────────────────────────────────────────────────────────────────
  const login = await raw('POST', '/auth/login', {
    body: { tenantSlug: TENANT || undefined, email: EMAIL, password: PASSWORD },
    auth: false,
  });
  if (login.status === 200 && login.json?.data?.accessToken) {
    accessToken = login.json.data.accessToken;
    refreshToken = login.json.data.refreshToken;
    const u = login.json.data.user ?? {};
    record('auth/login', true, `employeeId=${u.employeeId ?? 'null'} name=${u.name ?? '?'} tenant=${u.tenantSlug ?? '?'}`);
  } else {
    record('auth/login', false, `${login.status} ${errOf(login)}`);
    console.log('\nCannot continue without a session.');
    process.exit(1);
  }

  const me = await call('GET', '/auth/me').catch(() => ({ status: 0 }));
  record('auth/me', me.status === 200 || me.status === 404, `${me.status}`);

  // ── PROFILE ─────────────────────────────────────────────────────────────
  const profile = await call('GET', '/employees/me');
  const emp = profile.json?.data?.employee;
  record(
    'GET /employees/me',
    profile.status === 200 && !!emp,
    profile.status === 200 ? `${emp?.name ?? emp?.firstName} · ${emp?.status ?? '?'} · ${emp?.company?.name ?? emp?.companyId ?? '?'}` : `${profile.status} ${errOf(profile)}`
  );
  if (emp?.phone) {
    const patch = await call('PATCH', '/employees/me', { body: { phone: emp.phone } });
    record('PATCH /employees/me (no-op)', patch.status === 200, `${patch.status}`);
  }

  // ── ATTENDANCE ──────────────────────────────────────────────────────────
  const config = await call('GET', '/attendance/config');
  record('GET /attendance/config', config.status === 200, `${config.status} methods=${config.json?.data?.methods?.join(',') ?? '?'} policy=${config.json?.data?.policy?.geofencePolicy ?? '?'}`);
  const worksites = await call('GET', '/attendance/worksites');
  record('GET /attendance/worksites', worksites.status === 200, `${worksites.status} count=${worksites.json?.data?.worksites?.length ?? '?'}`);
  const status0 = await call('GET', '/attendance/status');
  record('GET /attendance/status', status0.status === 200, `${status0.status} current=${status0.json?.data?.current ?? '?'} today=${status0.json?.data?.today?.length ?? '?'}`);
  const history = await call('GET', '/attendance/events?limit=10');
  record('GET /attendance/events', history.status === 200, `${history.status}`);

  if (WRITE) {
    const eventId = hex();
    const punchBody = {
      eventId,
      idempotencyKey: eventId,
      method: 'GPS',
      capturedAt: new Date().toISOString(),
      location: { latitude: -6.2088, longitude: 106.8456, accuracyMeters: 25 },
    };
    const punch = await call('POST', '/attendance/events', { body: punchBody, headers: { 'Idempotency-Key': eventId } });
    const ev = punch.json?.data?.event;
    record(
      'POST /attendance/events',
      punch.status === 200,
      `${punch.status}${ev ? ` status=${ev.status} type=${ev.attendanceType ?? 'null'}${ev.rejectionReason ? ` reason=${ev.rejectionReason}` : ''}${ev.distanceMeters != null ? ` distance=${Math.round(ev.distanceMeters)}m` : ''}` : ` ${errOf(punch)}`}`
    );
    if (punch.status === 200) {
      const replay = await call('POST', '/attendance/events', { body: { ...punchBody, capturedAt: new Date().toISOString() }, headers: { 'Idempotency-Key': eventId } });
      record('POST /attendance/events (replay → DUPLICATE)', replay.json?.data?.event?.status === 'DUPLICATE', `${replay.status} ${replay.json?.data?.event?.status ?? errOf(replay)}`);
      const status1 = await call('GET', '/attendance/status');
      record('status shows the punch', (status1.json?.data?.today?.length ?? 0) > (status0.json?.data?.today?.length ?? 0), `today=${status1.json?.data?.today?.length}`);
    }
  }

  // ── LEAVE ───────────────────────────────────────────────────────────────
  const types = await call('GET', '/ess/leave/types');
  record('GET /ess/leave/types', types.status === 200, `${types.status} leaveTypes=${types.json?.data?.types?.length ?? '?'} permissionTypes=${types.json?.data?.permissionTypes?.length ?? '?'}`);
  const balances = await call('GET', '/ess/leave/balances');
  const firstBal = balances.json?.data?.balances?.[0];
  record('GET /ess/leave/balances', balances.status === 200, `${balances.status} count=${balances.json?.data?.balances?.length ?? '?'}${firstBal ? ` (${firstBal.name}: ${firstBal.available} available)` : ' (none seeded)'}`);

  const leaveType = types.json?.data?.types?.[0];
  if (leaveType) {
    // Contract: flat fields — leaveTypeId, startDate, endDate, halfDay.
    const preview = await call('POST', '/ess/leave/requests/preview', {
      body: { leaveTypeId: leaveType.id, startDate: '2026-12-21', endDate: '2026-12-21', halfDay: 'NONE' },
    });
    record('POST /ess/leave/requests/preview', preview.status === 200 || preview.status === 409, `${preview.status}${preview.status === 200 ? ` workingDays=${preview.json?.data?.workingDays ?? '?'}` : ` ${errOf(preview)}`}`);
  }

  // ── REQUESTS ────────────────────────────────────────────────────────────
  const list = await call('GET', '/ess/requests?limit=10');
  const rows = list.json?.data?.requests ?? [];
  record('GET /ess/requests', list.status === 200, `${list.status} rows=${rows.length}`);
  const filtered = await call('GET', '/ess/requests?status=APPROVED&limit=5');
  record('GET /ess/requests?status=APPROVED', filtered.status === 200, `${filtered.status} rows=${filtered.json?.data?.requests?.length ?? '?'}`);
  if (rows[0]) {
    const detail = await call('GET', `/ess/requests/${rows[0].id}`);
    record('GET /ess/requests/:id', detail.status === 200, `${detail.status} ${detail.json?.data?.request?.requestNo ?? ''}`);
  }

  let createdLeaveId = null;
  if (WRITE && leaveType) {
    const idempotencyKey = hex();
    const submit = await multipart('/ess/leave/requests', {
      leaveTypeId: leaveType.id,
      startDate: '2026-12-22',
      endDate: '2026-12-22',
      halfDay: 'NONE',
      reason: 'Live smoke test (auto-cancelled)',
      idempotencyKey,
    });
    const req = submit.json?.data?.request;
    createdLeaveId = req?.id ?? null;
    record(
      'POST /ess/leave/requests',
      submit.status === 200 || submit.status === 409,
      `${submit.status}${req ? ` ${req.requestNo} (${req.status})` : ` ${errOf(submit)} | body: ${(submit.text || '').slice(0, 200)}`}`
    );
  }

  // ── APPROVALS / MANAGER ─────────────────────────────────────────────────
  const inbox = await call('GET', '/ess/approvals');
  record('GET /ess/approvals', inbox.status === 200 || inbox.status === 403, `${inbox.status}${inbox.status === 200 ? ` pending=${inbox.json?.data?.requests?.length ?? '?'}` : ' (not a manager — expected)'}`);
  const delegations = await call('GET', '/ess/delegations');
  record('GET /ess/delegations', delegations.status === 200 || delegations.status === 403, `${delegations.status}`);
  const mgrDash = await call('GET', '/ess/manager/dashboard');
  record('GET /ess/manager/dashboard', mgrDash.status === 200 || mgrDash.status === 403, `${mgrDash.status}${mgrDash.status === 200 ? ` pending=${mgrDash.json?.data?.pending ?? mgrDash.json?.data?.summary?.pending ?? '?'}` : ''}`);
  const mgrTeam = await call('GET', '/ess/manager/team');
  record('GET /ess/manager/team', mgrTeam.status === 200 || mgrTeam.status === 403, `${mgrTeam.status}${mgrTeam.status === 200 ? ` team=${mgrTeam.json?.data?.team?.length ?? mgrTeam.json?.data?.members?.length ?? '?'}` : ''}`);
  const firstInbox = inbox.json?.data?.requests?.[0];
  if (firstInbox?.requestId) {
    record('GET /ess/approvals/:id', (await call('GET', `/ess/approvals/${firstInbox.requestId}`)).status === 200, '');
  }

  // ── PAYROLL ─────────────────────────────────────────────────────────────
  const summary = await call('GET', '/ess/payroll/summary');
  record('GET /ess/payroll/summary', summary.status === 200, `${summary.status}`);
  const periods = await call('GET', '/ess/payroll/periods');
  const firstPeriod = periods.json?.data?.periods?.[0];
  record('GET /ess/payroll/periods', periods.status === 200, `${periods.status} count=${periods.json?.data?.periods?.length ?? '?'}`);
  if (firstPeriod?.id) {
    record('GET payslip', (await call('GET', `/ess/payroll/periods/${firstPeriod.id}/payslip`)).status === 200, '');
    const pdf = await call('GET', `/ess/payroll/periods/${firstPeriod.id}/payslip/pdf`);
    record('GET payslip PDF (base64)', pdf.status === 200, `${pdf.status}${pdf.json?.data?.dataBase64 ? ` ${Math.round((pdf.json.data.dataBase64.length * 3) / 4 / 1024)} KB` : ''}`);
  }
  for (const p of ['/ess/payroll/payments', '/ess/payroll/documents', '/ess/payroll/inquiries']) {
    record(`GET ${p}`, (await call('GET', p)).status === 200, '');
  }
  const firstInquiry = (await call('GET', '/ess/payroll/inquiries')).json?.data?.inquiries?.[0];
  if (firstInquiry?.id) {
    record('GET /ess/payroll/inquiries/:id', (await call('GET', `/ess/payroll/inquiries/${firstInquiry.id}`)).status === 200, '');
  }

  // ── Talent / performance (reads) ────────────────────────────────────────
  const performance = await call('GET', '/talent/performance');
  record(
    'GET /talent/performance',
    performance.status === 200,
    `${performance.status} summary=${performance.json?.data?.summary ? 'published' : 'none'} trend=${performance.json?.data?.trend?.length ?? '?'}`
  );
  const talentReviews = await call('GET', '/talent/reviews');
  const talentItems = talentReviews.json?.data?.items ?? [];
  record('GET /talent/reviews', talentReviews.status === 200, `${talentReviews.status} items=${talentItems.length}`);
  if (talentItems[0]?.id) {
    const one = await call('GET', `/talent/reviews/${talentItems[0].id}`);
    record('GET /talent/reviews/:id', one.status === 200, `${one.status} state=${one.json?.data?.review?.state ?? '?'}`);
  }

  // ── NOTIFICATIONS (legacy route) ────────────────────────────────────────
  const notif = await call('GET', '/notifications');
  record('GET /notifications', notif.status === 200 || notif.status === 404, `${notif.status}`);

  // ── CLEANUP ─────────────────────────────────────────────────────────────
  if (createdLeaveId) {
    const cancel = await call('POST', `/ess/requests/${createdLeaveId}/cancel`, { body: { reason: 'Cleanup after live smoke test' } });
    record('POST /ess/requests/:id/cancel (cleanup)', cancel.status === 200, `${cancel.status}${cancel.status !== 200 ? ` ${errOf(cancel)}` : ''}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} failed` : ''}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
