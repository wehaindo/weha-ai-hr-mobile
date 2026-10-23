# ESS Backend API Reference — every endpoint required from `weha-ai-hrd`

One consolidated reference for the backend developer building the WEHA HRD
ESS surface **in `weha-ai-hrd`** (dev port 3278). It aggregates every
endpoint the ESS client (`weha-ai-hrd-mobile`) calls, with the request data
and response format of each. Per the Phase 5/6 decisions this is a
**single-backend deployment**: `weha-ai-hrd` contains the framework code
(mobile auth, `employees/me`) plus attendance/HR/payroll — everything below
is implemented or verified there.

Detailed contracts (authoritative for rules, validation, security matrices,
Prisma proposals — this doc is the consolidated interface index):

| Area | Contract | Notes |
|---|---|---|
| Auth / profile | `docs/ESS-API-CONTRACT.md` | PATCH /employees/me is the only new auth-surface endpoint |
| Attendance capture | `docs/ESS-ATTENDANCE-CONTRACT.md` | §2 record-model proposals superseded by the manager contract §1 |
| HR requests | `docs/ESS-REQUESTS-CONTRACT.md` | approvals endpoints superseded by the manager contract |
| Payroll & inquiries | `docs/ESS-PAYROLL-CONTRACT.md` | |
| Approvals / manager | `docs/ESS-MANAGER-CONTRACT.md` | **authoritative** for approvals + request records |

## 0. Conventions (apply to every endpoint below)

- Base URL: `{NEXT_PUBLIC_ERP_BASE_URL}` → the `weha-ai-hrd` deployment;
  all paths under `/api/mobile/v1/`.
- **Auth**: `Authorization: Bearer <access token>` (mobile JWT, 15-min TTL,
  refreshed with a 5-min skew). Employee identity = `context.employeeId`
  from the token — **bodies never carry an authoritative id**. Tenant comes
  from the JWT. `OPTIONS` returns 204 with `MOBILE_CORS_HEADERS`.
- **Envelope**: success `{"success": true, "data": …}`;
  failure `{"success": false, "error": "<code>", "message": "<text>"}`.
- **Timestamps**: ISO-8601 UTC strings; dates as `YYYY-MM-DD`; times as
  `HH:MM` (24h). Display timezone is the client's concern.
- **Money / decimals**: JSON **strings** (`"10250000.00"`) — never floats
  (BRD Phase 5 §7). Counts are numbers.
- **Idempotent writes**: header `Idempotency-Key: <client id>` must equal the
  body's `idempotencyKey`; replays return the ORIGINAL result, never a
  duplicate.
- **Multipart submits** (requests/inquiries): `Content-Type:
  multipart/form-data` with a `request` part (JSON string of the body fields
  below) and 0–3 `files` parts (images/PDF, ≤5 MB each).
- **Pagination**: opaque `cursor` in, `nextCursor` (string | null) out;
  `limit` ≤ 50 unless stated.
- **Rate limits** (per employee): reads 30/min, downloads 10/min,
  submissions/decisions as stated per contract — 429 `rate_limited`.
- **Status legend**: ✅ **EXISTS** = route already in `weha-ai-hrd`
  (verify shape only) · 🆕 **NEW** = must be built.

## 1. Endpoint index

| # | Method | Path | Status | Purpose | Source |
|---|---|---|---|---|---|
| 1 | POST | `/auth/login` | ✅ | Email+password sign-in | ESS-API §1 |
| 2 | POST | `/auth/otp/request` | ✅ | Request email OTP | ESS-API §1 |
| 3 | POST | `/auth/otp/verify` | ✅ | Verify OTP → session | ESS-API §1 |
| 4 | POST | `/auth/refresh` | ✅ | Rotate token pair | ESS-API §1 |
| 5 | POST | `/auth/logout` | ✅ | Revoke refresh token | ESS-API §1 |
| 6 | GET | `/auth/me` | ✅ | Token identity + linked records | ESS-API §1 |
| 7 | GET | `/employees/me` | ✅ | Authorized profile (safe fields) | ESS-API §1.1 |
| 8 | PATCH | `/employees/me` | 🆕 | Edit email/phone only | ESS-API §2 |
| 9 | GET | `/notifications` | ✅ | In-app notification list | (Phase 6 §5) |
| 10 | GET | `/attendance/config` | 🆕 | Allowed methods + policy | ATTENDANCE §3.1 |
| 11 | GET | `/attendance/worksites` | 🆕 | Assigned worksites + geofences | ATTENDANCE §3.2 |
| 12 | GET | `/attendance/status` | 🆕 | Current state + today's punches | ATTENDANCE §3.3 |
| 13 | POST | `/attendance/events` | 🆕 | Submit one punch (idempotent) | ATTENDANCE §3.4 |
| 14 | POST | `/attendance/events/sync` | 🆕 | Batch drain (≤20) | ATTENDANCE §3.6 |
| 15 | GET | `/attendance/events` | 🆕 | Own attendance history | ATTENDANCE §3.7 |
| 16 | GET | `/attendance/events/:id` | 🆕 | Authoritative event status | ATTENDANCE §3.7 |
| 17 | GET | `/ess/leave/types` | 🆕 | Leave + permission type config | REQUESTS §3.1 |
| 18 | GET | `/ess/leave/balances` | 🆕 | Balances incl. pending | REQUESTS §3.1 |
| 19 | POST | `/ess/leave/requests/preview` | 🆕 | Working days / overlap / availability | REQUESTS §3 |
| 20 | POST | `/ess/leave/requests` | 🆕 | Submit leave (multipart) | REQUESTS §3.1/§4.1 |
| 21 | POST | `/ess/permission/requests` | 🆕 | Submit permission (multipart) | REQUESTS §4.1 |
| 22 | POST | `/ess/overtime/requests` | 🆕 | Submit overtime (multipart) | REQUESTS §4.1 |
| 23 | POST | `/ess/attendance-corrections` | 🆕 | Submit correction (multipart) | REQUESTS §4.1 |
| 24 | GET | `/ess/requests` | 🆕 | Own consolidated history | REQUESTS §3.7 |
| 25 | GET | `/ess/requests/:id` | 🆕 | Own request detail + timeline | REQUESTS §3.7 |
| 26 | POST | `/ess/requests/:id/cancel` | 🆕 | Cancel pending / start cancellation | REQUESTS §3.7 |
| 27 | POST | `/ess/requests/:id/resubmit` | 🆕 | Resubmit RETURNED (+ version bump) | REQUESTS §3.7 + MANAGER §2 |
| 28 | GET | `/ess/requests/:id/attachments/:aid` | 🆕 | Authorized attachment download (base64) | REQUESTS §4 |
| 29 | GET | `/ess/requests/:id/history` | 🆕 | Authorized workflow history | MANAGER §4 |
| 30 | GET | `/ess/manager/dashboard` | 🆕 | FR-601 counts + team snapshot | MANAGER §4.1 |
| 31 | GET | `/ess/manager/team` | 🆕 | Paginated authorized team | MANAGER §4.2 |
| 32 | GET | `/ess/approvals` | 🆕 | Manager inbox (filters + cursor) | MANAGER §4.3 |
| 33 | GET | `/ess/approvals/:requestId` | 🆕 | Approval detail + contexts | MANAGER §4.4 |
| 34 | POST | `/ess/approvals/:requestId/decision` | 🆕 | Approve / reject / return | MANAGER §4.5 |
| 35 | GET | `/ess/delegations` | 🆕 | Read-only delegation rules | MANAGER §4.6 |
| 36 | GET | `/ess/payroll/summary` | 🆕 | Payroll dashboard (published only) | PAYROLL §3.1 |
| 37 | GET | `/ess/payroll/periods` | 🆕 | Published periods history | PAYROLL §3.2 |
| 38 | GET | `/ess/payroll/periods/:periodId/payslip` | 🆕 | Payslip + breakdown | PAYROLL §3.3 |
| 39 | GET | `/ess/payroll/periods/:periodId/payslip/pdf` | 🆕 | Server-generated PDF (base64) | PAYROLL §3.4 |
| 40 | GET | `/ess/payroll/documents` | 🆕 | Released tax/payroll documents | PAYROLL §3.4 |
| 41 | GET | `/ess/payroll/documents/:documentId/download` | 🆕 | Document download (base64) | PAYROLL §3.4 |
| 42 | GET | `/ess/payroll/payments` | 🆕 | Payment history | PAYROLL §3.2 |
| 43 | POST | `/ess/payroll/inquiries` | 🆕 | Submit payroll inquiry (multipart) | PAYROLL §3.5 |
| 44 | GET | `/ess/payroll/inquiries` | 🆕 | Own inquiry list | PAYROLL §3.5 |
| 45 | GET | `/ess/payroll/inquiries/:inquiryId` | 🆕 | Inquiry + message thread | PAYROLL §3.5/§3.6 |
| 46 | POST | `/ess/payroll/inquiries/:inquiryId/messages` | 🆕 | Employee follow-up message | PAYROLL §3.5 |

> Legacy route note: `GET /approval-requests/me` exists and remains usable,
> but the ESS client consumes **#32 `/ess/approvals`** (it adds filters,
> cursor, overdue and version) — implement #32 as the primary inbox.

## 2. Authentication & session (1–6, EXISTING)

All bodies/response fields below are what the ESS client parses today.

**1 POST `/auth/login`** — body `{ "email": "budi@example.com",
"password": "…", "tenantSlug": "default" }` (tenantSlug optional/empty →
single-tenant default) →

```jsonc
{ "success": true, "data": {
  "accessToken": "…", "refreshToken": "…", "tokenType": "Bearer",
  "expiresIn": 900,
  "user": { "userId": "u-1", "employeeId": "e-1", "portalUserId": "p-1",
    "email": "budi@example.com", "name": "Budi Santoso", "tenantSlug": "default" }
} }
```

Errors: 401 invalid credentials (`error: "unauthorized"`), 403
`setup_required` / `otp_required` (account has no mobile password → client
switches to OTP).

**2 POST `/auth/otp/request`** — `{ "email": "…", "tenantSlug": "" }` →
`{ "sent": true, "devCode": "123456" }` (devCode only in development
environments).

**3 POST `/auth/otp/verify`** — `{ "email": "…", "otp": "123456" }` → same
session shape as #1 (401 `otp_required` when the code is wrong/expired).

**4 POST `/auth/refresh`** — `{ "refreshToken": "…" }` → token fields as in
#1 (401 `unauthorized` when revoked — client forces logout).

**5 POST `/auth/logout`** — `{ "refreshToken": "…" }` → `{ "revoked": true }`.

**6 GET `/auth/me`** (no body) →

```jsonc
{ "success": true, "data": {
  "claims": { "userId": "u-1", "employeeId": "e-1", "portalUserId": "p-1", "tenantId": "…", "type": "access" },
  "employee": { "id": "e-1", "userId": "u-1", "employeeNumber": "EMP-007",
    "firstName": "Budi", "lastName": "Santoso", "name": "Budi Santoso",
    "email": "budi@example.com", "phone": "+628111111", "status": "ACTIVE",
    "isActive": true, "companyId": "co-1", "departmentId": "dep-1",
    "positionId": null, "avatarColor": null } | null,
  "portalUser": { "id": "p-1", "email": "…", "name": "…", "employeeId": "e-1", "isActive": true } | null
} }
```

## 3. Employee profile (7–8) and notifications (9)

**7 GET `/employees/me`** (EXISTS) → `data.employee` (sensitive columns
`nik/npwp/salary/bank*` are NEVER selected):

```jsonc
{ "employee": {
  "id": "e-1", "employeeNumber": "EMP-007", "firstName": "Budi", "lastName": "Santoso",
  "name": "Budi Santoso", "email": "budi@example.com", "phone": "+628111111",
  "status": "ACTIVE", "isActive": true,
  "companyId": "co-1", "departmentId": "dep-1", "positionId": "pos-1", "managerId": null,
  "position": "Store Supervisor", "hireDate": "2024-01-15T00:00:00.000Z",
  "birthDate": null, "gender": "MALE", "maritalStatus": "SINGLE", "avatarColor": "#ff0000",
  "company": { "id": "co-1", "name": "WEHA Retail" },
  "department": { "id": "dep-1", "name": "Operations" },
  "manager": { "id": "…", "firstName": null, "lastName": null, "name": null } | null
} }
```

The three relation objects are an **additive request** in the contract
(§1.1) so the client avoids extra round-trips; until they land the client
falls back to raw ids.

**8 PATCH `/employees/me`** 🆕 — body **exactly**
`{ "email"?: string, "phone"?: string }` — any other key → 403
`protected_field`; invalid email → 400 `validation`; duplicate email → 409
`conflict`. → `data.employee` (same select as #7).

**9 GET `/notifications`** (EXISTS) — query `?unread=1` (only unread),
`?limit=50` (1–100) →

```jsonc
{ "notifications": [ { "id": "…", "recipientId": "e-1", "type": "APPROVAL",
    "title": "Leave approval requested", "message": "…", "link": null,
    "data": { }, "readAt": null, "createdAt": "…" } ],
  "unreadCount": 3 }
```

## 4. Attendance capture (10–16)

**10 GET `/attendance/config`** →

```jsonc
{ "methods": ["GPS", "QR"],
  "policy": { "duplicateIntervalSeconds": 120, "offlineAllowed": true,
    "geofencePolicy": "REJECT", "maxAccuracyMeters": 100, "lateSyncHours": 24 },
  "serverTime": "…" }
```

**11 GET `/attendance/worksites`** →

```jsonc
{ "worksites": [ { "id": "ws_…", "name": "WEHA Retail — Branch Jakarta",
  "storeId": "st_…", "latitude": -6.2088, "longitude": 106.8456,
  "radiusMeters": 100, "maxAccuracyMeters": 100, "qrEnabled": true,
  "isPrimary": true, "isActive": true } ] }
```

**12 GET `/attendance/status`** →

```jsonc
{ "current": "NOT_STARTED",          // NOT_STARTED | PRESENT | FINISHED
  "expectedNext": "CHECK_IN",        // CHECK_IN | CHECK_OUT | null
  "today": [ { /* event shape, see #13 */ } ],
  "serverTime": "…" }
```

**13 POST `/attendance/events`** — headers `Idempotency-Key: <eventId>`.
Body (exactly these keys; anything else → 403 `protected_field`):

```jsonc
{ "eventId": "5f1c9a2b7d3e4f01",     // 16-hex; = idempotencyKey
  "idempotencyKey": "5f1c9a2b7d3e4f01",
  "method": "GPS",                     // GPS | QR
  "capturedAt": "2026-10-22T08:01:59.000Z",
  "location": {                        // required when method = GPS
    "worksiteId": "ws_…", "latitude": -6.20881, "longitude": 106.84562,
    "accuracyMeters": 12, "distanceMeters": 34.5, "withinGeofence": true },
  "credential": { "type": "QR", "payload": "WEHAATT:…" } }   // required when method = QR
```

Response (**HTTP 200 in all business outcomes** — the server recomputes
distance/validity, resolves check-in vs check-out, and never trusts client
`status`):

```jsonc
{ "event": { "id": "5f1c9a2b7d3e4f01", "attendanceType": "CHECK_IN",
  "method": "GPS", "status": "ACCEPTED",     // ACCEPTED | REJECTED | DUPLICATE
  "recordedAt": "2026-10-22T08:02:15.000Z",  // SERVER time
  "receivedAt": "…", "worksite": { "id": "ws_…", "name": "…" },
  "distanceMeters": 34.5,                    // server-recomputed
  "rejectionReason": null,                   // e.g. outside_geofence / invalid_qr
  "duplicateOfEventId": null }, "serverTime": "…" }
```

Idempotent replay → the original result with `status:"DUPLICATE"` +
`duplicateOfEventId`. Transport errors: 400 `validation`, 403
`protected_field`/`no_employee`, 429 `rate_limited`.

**14 POST `/attendance/events/sync`** — `{ "events": [ <#13 body> … ] }`
(1–20, independent results) → `{ "results": [ <#13 event> … ], "serverTime" }`
in submission order.

**15 GET `/attendance/events`** — `?from=ISO&limit=1..100` (default 30), own
employee only → `{ "events": [ <event> … ], "serverTime" }`.

**16 GET `/attendance/events/:id`** → `{ "event": <event> }`; foreign or
unknown → 404 `not_found`.

## 5. HR requests: leave, permission, overtime, correction (17–29)

**17 GET `/ess/leave/types`** →

```jsonc
{ "types": [ { "id": "lt_…", "code": "ANNUAL", "name": "Annual leave",
    "unit": "DAYS", "halfDayAllowed": true, "requiresAttachment": false,
    "consumesBalance": true, "maxConsecutiveDays": null } ],
  "permissionTypes": [ { "code": "sick", "name": "Sick leave",
    "requiresAttachment": false, "consumesBalance": true, "isTimed": false } ] }
```

**18 GET `/ess/leave/balances`** →

```jsonc
{ "balances": [ { "leaveTypeId": "lt_…", "code": "ANNUAL", "name": "Annual leave",
  "unit": "DAYS", "period": "2026", "entitled": 12, "used": 6, "pending": 1,
  "available": 5 } ] }   // Decimal fields may be numbers or strings (client coerces)
```

**19 POST `/ess/leave/requests/preview`** — body
`{ "leaveTypeId": "lt_…", "startDate": "2026-11-02", "endDate": "2026-11-04",
"halfDay"?: "NONE"|"FIRST"|"SECOND" }` →
`{ "workingDays": 3, "overlap": false, "available": 5 }` (no writes).

**20–23 Submissions** — multipart (`request` + `files[]`). The `request`
JSON part per type (exactly these keys; anything else → 403
`protected_field`):

```jsonc
// 20 leave
{ "idempotencyKey": "<16-hex>", "leaveTypeId": "lt_…",
  "startDate": "2026-11-02", "endDate": "2026-11-04",
  "halfDay": "NONE", "reason": "Family holiday" }
// 21 permission
{ "idempotencyKey": "…", "permissionCode": "sick", "date": "2026-10-30",
  "startTime": "09:00", "endTime": "13:00",   // only when the type isTimed
  "reason": "…" }
// 22 overtime
{ "idempotencyKey": "…", "date": "2026-10-28", "startTime": "18:00",
  "endTime": "21:00", "reason": "…", "workDescription": "…",
  "locationText": "Warehouse", "projectId": null }   // both optional
// 23 attendance correction
{ "idempotencyKey": "…", "attendanceDate": "2026-10-27",
  "originalTime": "08:00", "requestedTime": "07:58", "explanation": "…" }
```

Common success response (HTTP 200): `{ "request": <projection — see #24> }`.
Domain errors (HTTP 409, `error` field): `overlap`, `insufficient_balance`,
`schedule_conflict`, `status_conflict`; HTTP 400: `validation`,
`attachment_required`, `attachment_too_large`, `unsupported_type`.
Idempotent replay returns the original request (same `idempotencyKey`).

**24 GET `/ess/requests`** — `?status=SUBMITTED|IN_REVIEW|RETURNED|APPROVED|
REJECTED|CANCELLED|COMPLETED&type=LEAVE|…&limit=` →

```jsonc
{ "requests": [ { "id": "…", "requestNo": "ESS-REQ-2026-000123",
  "type": "LEAVE", "status": "IN_REVIEW", "submittedAt": "…",
  "decidedAt": null, "reason": "…", "workingDays": 3, "expectedHours": null,
  "period": { "start": "2026-11-02", "end": "2026-11-04", "halfDay": "NONE" },
  "currentStepName": "HR review", "approverName": null, "returnReason": null,
  "attachmentCount": 1,
  "attachments": [ { "id": "…", "fileName": "bukti.pdf",
      "mimeType": "application/pdf", "size": 1234 } ],
  "timeline": [ { "stepName": "Direct manager", "action": "APPROVED",
      "actorName": "Sari Admin", "notes": "OK", "createdAt": "…" } ],
  "originalRequestNo": null } ] }
```

(`type` ∈ `LEAVE | PERMISSION | OVERTIME | ATTENDANCE_CORRECTION |
LEAVE_CANCELLATION`; `status` ∈ `SUBMITTED | IN_REVIEW | RETURNED |
APPROVED | REJECTED | CANCELLED | COMPLETED`.)

**25 GET `/ess/requests/:id`** → `{ "request": <single #24 projection> }`
(404 for other employees' rows).

**26 POST `/ess/requests/:id/cancel`** — `{ "reason": "…" }` →
`{ "request": <projection, status: CANCELLED> }`. Pending → engine cancel;
APPROVED leave → creates a `LEAVE_CANCELLATION` request through the same
flow; already-decided overtime/correction → 409 `status_conflict`.

**27 POST `/ess/requests/:id/resubmit`** — multipart (`request` = corrected
fields incl. `idempotencyKey`, optional `files[]`) → `{ "request":
<projection> }` with **`version` incremented** and status back in review;
wrong state → 409 `status_conflict`.

**28 GET `/ess/requests/:id/attachments/:aid`** →
`{ "file": { "base64": "…", "fileName": "bukti.pdf",
"mimeType": "application/pdf" } }` — requester / current approver / HR only;
others 404.

**29 GET `/ess/requests/:id/history`** →

```jsonc
{ "history": [ { "stepName": "Direct manager", "action": "APPROVED",
  "actorName": "Sari Admin", "notes": "OK", "createdAt": "…",
  "correlationId": "corr-1", "recordVersion": 1, "delegatorId": null } ] }
```

(authorized requester/approver only).

## 6. Approvals & manager dashboard (30–35)

Scope for 30/31 = employees with `managerId = token employee` + departments
they manage; **whitelisted fields only** (no salary/phone — BRD Phase 6 §8).

**30 GET `/ess/manager/dashboard`** →

```jsonc
{ "teamCount": 8, "pendingCount": 3, "completed30d": 12, "rejected30d": 1,
  "overdueCount": 1,
  "team": [ { "employeeId": "e-1", "name": "Budi Santoso",
    "department": "Operations",
    "todayAttendance": { "status": "PRESENT", "checkIn": "08:01", "checkOut": null },
    // todayAttendance = null when not yet calculated (never fabricated)
    "pendingCount": 1 } ],
  "serverTime": "…" }
```

`todayAttendance.status` ∈ `PRESENT | ABSENT | LATE | HALF_DAY | ON_LEAVE |
HOLIDAY | REST_DAY | INCOMPLETE`.

**31 GET `/ess/manager/team`** — `?search=&cursor=&limit=` (search matches
name/employeeNumber, escaped) → `{ "team": [ <#30 team row> ],
"nextCursor": "…" | null }`.

**32 GET `/ess/approvals`** — `?formType=&status=&overdue=true&q=&cursor=&limit=`
(default = pending only; `limit` ≤ 50) →

```jsonc
{ "requests": [ { "requestId": "…", "recordId": "…",   // ApprovalRequest → record id
  "requestNo": "…", "formType": "LEAVE",
  "employee": { "id": "e-1", "name": "Budi Santoso", "department": "Operations" },
  "submittedAt": "…", "period": { "start": "…", "end": "…", "halfDay": "NONE" },
  "reason": "…", "currentStepName": "Direct manager", "ageDays": 2,
  "overdue": false, "version": 1, "hasAttachments": true } ],
  "nextCursor": null }
```

**33 GET `/ess/approvals/:requestId`** →
`{ "request": <#24 projection incl. timeline/attachments>,
"employee": { "id": "…", "name": "…", "department": "…" },
"previousRequestCount": 4, "recordId": "…", "version": 1,
"availableActions": ["APPROVED","REJECTED","RETURNED"] }` plus exactly one
context object:

```jsonc
// formType LEAVE
"leaveContext": { "leaveType": "Annual leave", "startDate": "2026-11-02",
  "endDate": "2026-11-04", "requestedDays": 3,
  "balance": { "entitled": 12, "used": 6, "pending": 1, "available": 5 },
  "overlapping": [ { "requestNo": "…", "start": "…", "end": "…", "status": "APPROVED" } ] }

// formType ATTENDANCE_CORRECTION
"correctionContext": { "workDate": "2026-10-27", "correctionType": "CHECK_IN",
  "before": { "checkIn": null }, "after": { "checkIn": "07:58" },
  "attendance": { "status": "INCOMPLETE", "checkIn": null, "checkOut": null },
  "originalPunch": { "punchAt": "2026-10-27T08:00:11.000Z",
      "punchType": "CHECK_IN", "source": "DEVICE", "dedupeKey": "dk-1" },
  "schedule": { "shiftName": "Morning (07:00–16:00)" },
  "flags": ["possible_duplicate"] }
  // flags ⊆ possible_duplicate | missing_punch | schedule_conflict
```

**34 POST `/ess/approvals/:requestId/decision`** — headers
`Idempotency-Key: <fresh per user action>`. Body:
`{ "action": "APPROVED" | "REJECTED" | "RETURNED", "notes": "…",
"expectedVersion": 1 }` — `notes` REQUIRED for REJECTED/RETURNED (400) →

```jsonc
{ "requestId": "…", "action": "APPROVED", "recordStatus": "APPROVED",
  "version": 1, "nextStepName": "HR review" }   // nextStepName | null
```

Errors: 409 `version_conflict` (stale `expectedVersion` — client reloads
and re-reviews), 409 `self_approval_forbidden`, 409 `status_conflict`
(already decided), 403 (not your slot / no active delegation),
429 `rate_limited`. A final approval runs the business writeback in one
transaction (leave: ledger + balance; correction: `state → APPROVED` then a
`BackgroundJob(ATTENDANCE_RECALCULATE)` → `APPROVED→APPLIED`; **raw
`AttendancePunch` rows are never modified**).

**35 GET `/ess/delegations`** — `?scope=inbound|outbound` →

```jsonc
{ "delegations": [ { "id": "…", "direction": "INBOUND",
  "counterpart": { "id": "e-9", "name": "Pak Boss" },
  "startsAt": "…", "endsAt": "…", "formTypes": ["LEAVE"],   // | null = all
  "isActive": true } ] }
```

## 7. Payroll & inquiries (36–46)

**Visibility gate (BRD Phase 5 §4.1):** payroll data is exposed ONLY for
periods/runs at `POSTED` or beyond; `PAID` requires a `PayrollPayment`
record; unpublished amounts must never appear in any response.

**36 GET `/ess/payroll/summary`** →

```jsonc
{ "published": true,        // false → NO amounts anywhere in the payload
  "latest": { "periodId": "per-9", "periodCode": "2026-09",
    "periodLabel": "September 2026", "netSalary": "10250000.00",
    "paymentStatus": "PAID",             // PUBLISHED | PAID | FINALIZED | CANCELLED
    "paymentDate": "2026-09-27", "payslipNumber": "PAYSLIP-2026-000123",
    "hasPayslip": true },
  "ytd": { "gross": "102500000.00", "deductions": "12500000.00" },
  "releasedDocumentCount": 1, "openInquiryCount": 0, "serverTime": "…" }
```

**37 GET `/ess/payroll/periods`** — `?year=2026` →

```jsonc
{ "periods": [ { "periodId": "…", "periodCode": "2026-09",
  "periodLabel": "September 2026", "netSalary": "10250000.00",
  "paymentStatus": "PAID", "paymentDate": "2026-09-27",
  "payslipNumber": "PAYSLIP-2026-000123", "hasPayslip": true } ] }
```

**38 GET `/ess/payroll/periods/:periodId/payslip`** →

```jsonc
{ "payslip": { "payslipId": "ps-1", "number": "PAYSLIP-2026-000123",
  "version": 1, "supersedesNumber": null, "publishedAt": "…",
  "employee": { "employeeNumber": "EMP-007", "name": "Budi Santoso",
    "company": "WEHA Retail", "department": "Operations", "position": "Store Supervisor" },
  "period": { "periodId": "per-9", "periodLabel": "September 2026",
    "paymentDate": "2026-09-27" },
  "payment": { "status": "PAID", "paidAt": "2026-09-27", "reference": "TRF-8871" },
  "earnings": [ { "code": "BASIC", "name": "Basic salary",
      "category": "FIXED_EARNING", "amount": "10000000.00" } ],
  "deductions": [ { "code": "PPh21", "name": "PPh 21",
      "category": "STATUTORY", "amount": "450000.00" } ],
  "employeeContributions": [ { "code": "BPJS_KES_EMP", "name": "BPJS Kesehatan (employee)",
      "category": "STATUTORY", "amount": "100000.00" } ],
  "employerContributions": [ { "code": "BPJS_KERJA_ER", "name": "BPJS Ketenagakerjaan (employer)",
      "category": "STATUTORY", "amount": "176000.00" } ],
  "summary": { "gross": "10700000.00", "totalDeductions": "550000.00",
    "netSalary": "10250000.00", "employerCost": "10876000.00" },
  "pdf": { "available": true, "generating": false } } }
```

Employee vs employer contributions are ALWAYS separate groups (BRD Phase 5
§4.4); PPh 21 is a normal deductions line.

**39 GET `/ess/payroll/periods/:periodId/payslip/pdf`** →
`{ "file": { "base64": "…", "fileName": "PAYSLIP-2026-000123.pdf",
"mimeType": "application/pdf" } }` — the PDF is generated asynchronously at
publication; not ready → HTTP 404 `{ "error": "document_generating" }`
(client shows "still being generated" and retries).

**40 GET `/ess/payroll/documents`** — `?year=2026` →

```jsonc
{ "documents": [ { "documentId": "…", "number": "PAYDOC-…",
  "type": "PPH21_1721_A1",       // PPH21_SUMMARY | PPH21_1721_A1 | BPJS_STATEMENT | OTHER
  "taxYear": 2025, "periodLabel": null, "status": "RELEASED",
  "releasedAt": "2026-03-01", "fileName": "1721-A1-2025.pdf",
  "size": 245000 } ] }           // only RELEASED + own-employee rows appear
```

**41 GET `/ess/payroll/documents/:documentId/download`** → the same
`{ "file" }` shape as #39 (owner-only, else 404; audit the access).

**42 GET `/ess/payroll/payments`** →

```jsonc
{ "payments": [ { "periodId": "…", "periodLabel": "September 2026",
  "paidAt": "2026-09-27", "reference": "TRF-8871", "method": "TRANSFER" } ] }
```

**43 POST `/ess/payroll/inquiries`** — multipart; `request` JSON part =
`{ "idempotencyKey": "<16-hex>", "category": "<enum>", "periodId": "per-9",
"subject": "…", "description": "…" }` where `category` ∈
`SALARY_DISCREPANCY | MISSING_ALLOWANCE_OVERTIME | INCORRECT_DEDUCTION |
PPH21_INQUIRY | BPJS_INQUIRY | LOAN_REIMBURSEMENT | MISSING_PAYSLIP_TAX_DOC |
OTHER`; `periodId` (optional) must reference an own posted period →
`{ "inquiry": <#45 projection> }` (idempotent replay returns the original).

**44 GET `/ess/payroll/inquiries`** — `?year=` →
`{ "inquiries": [ <#45 list projection> ] }`.

**45 GET `/ess/payroll/inquiries/:inquiryId`** →

```jsonc
{ "inquiry": { "inquiryId": "…", "number": "PAYINQ-2026-000042",
  "category": "INCORRECT_DEDUCTION", "periodId": "per-9",
  "periodLabel": "September 2026", "subject": "Deduction looks wrong",
  "status": "SUBMITTED",           // SUBMITTED | IN_PROGRESS | RESOLVED | CLOSED
  "submittedAt": "…", "resolvedAt": null, "attachmentCount": 1,
  "attachments": [ { "id": "…", "fileName": "bukti.pdf",
      "mimeType": "application/pdf", "size": 1234 } ],
  "messages": [ { "authorRole": "EMPLOYEE", "authorName": "Budi Santoso",
      "message": "…", "createdAt": "…" },
    { "authorRole": "HR", "authorName": "Sari Admin",
      "message": "…", "createdAt": "…" } ] } }
```

**46 POST `/ess/payroll/inquiries/:inquiryId/messages`** —
`{ "message": "…" }` (1–2000 chars; allowed while `status != CLOSED`, else
409 `status_conflict`) → `{ "inquiry": <#45 with the new message> }`.

## 8. Error code quick reference

| HTTP | `error` code | Meaning | Endpoints |
|---|---|---|---|
| 400 | `validation` | Bad fields/dates/format | all writes |
| 400 | `attachment_required` / `attachment_too_large` / `unsupported_type` | Attachment rules | 20–23, 43 |
| 401 | `unauthorized` | Missing/expired/revoked token | everything |
| 401 | `otp_required` / `setup_required` | OTP flow states | 2–3 |
| 403 | `no_employee` | Token has no linked employee | 7, submissions |
| 403 | `protected_field` | Non-allowlisted or identity keys in body | 8, 13, 20–23 |
| 403 | `no_employee_session`* | No local session row (client-side) | client-only |
| 404 | `not_found` / foreign row | Wrong id or not yours | all `:id` reads |
| 404 | `document_generating` | PDF/document not ready yet | 39, 41 |
| 409 | `conflict` | Duplicate email | 8 |
| 409 | `overlap` | Conflicting leave window | 20 |
| 409 | `insufficient_balance` | Not enough leave balance | 20 |
| 409 | `schedule_conflict` | Overtime clash | 22 |
| 409 | `status_conflict` | Wrong state for the action | 26, 27, 34, 46 |
| 409 | `version_conflict` | Stale `expectedVersion` | 34 |
| 409 | `self_approval_forbidden` | Approving your own request | 34 |
| 403/409 | (decision) | Not your slot / no active delegation | 34 |
| 429 | `rate_limited` | Over quota | everything |

## 9. Suggested build order (backend)

1. **Verify EXISTING (✅)** — items 1–7, 9: smoke-test the routes; add the
   `company/department/manager` relation select to `GET /employees/me`
   (contract ESS-API §1.1) and implement `PATCH /employees/me` (§2).
2. **Foundation** — items 10–16 (attendance: worksites/config + event
   endpoints with idempotency) and 17–29 (requests built **on the existing
   `LeaveRequest`/`AttendanceCorrection` tables** — see manager contract §1;
   includes the engine RETURNED action + `version` columns).
3. **Approvals & manager** — items 30–35 (decision concurrency with
   idempotency + expectedVersion, delegation model, SLA/overdue,
   writeback transactions, reminder/escalation/notification jobs on
   `BackgroundJob`).
4. **Payroll** — items 36–46 (payslip snapshots + async PDF generation,
   documents, payments, inquiries, notification subscriber with no-amount
   payloads).
5. Run each contract's security matrix as automated tests (they are
   release-blocking) — then point the ESS client's
   `NEXT_PUBLIC_ERP_BASE_URL` at the deployment and re-run the client's
   Playwright suites to promote mocked items to production-verified.
