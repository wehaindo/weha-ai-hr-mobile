# ESS Requests API Contract — for the WEHA Framework backend

Target implementation: `weha-framework` (read-only for the ESS client team;
this document is the interface the backend implements separately). Companions:
`docs/ESS-API-CONTRACT.md` (profile/auth), `docs/ESS-ATTENDANCE-CONTRACT.md`.

Base URL: `{NEXT_PUBLIC_ERP_BASE_URL}`; routes under `/api/mobile/v1/ess/`
(Phase 1/2/3 convention; the BRD's `/api/ess/*` paths are logical and adapted
here). Reuse from the existing conventions (verified in source):

- `createRouteHandler({ authType: 'mobile' })` —
  `lib/base-route-handler.ts:750-792`: Bearer access JWT, tenant from
  `payload.tenantId` → `getTenantClientForDevice`, and
  `context = { tenantDb, tenantId, employeeId, userId, request, params, body,
  query }`. **The employee is always `context.employeeId` — never a request
  value.** Envelope `{ "success": true, "data": … }` (line 1193); write-method
  audit via `recordAudit` (line 583); rate limiting via
  `lib/external-api/rate-limiter.ts` (response-header plumbing at line 1178).
- CORS: `MOBILE_CORS_HEADERS` on `OPTIONS` + responses.

## 1. Reuse — the approval engine already exists (do not build a second one)

ESS requests are **record models driven through the existing engine**
(`lib/workflow/approval-engine.ts`):

| Engine API | Use for ESS |
|---|---|
| `startApprovalFlow({tenantDb, tenantId, formType, recordId, requestedById, recordData, writeback})` | Submission: `formType` per request type (`ESS_LEAVE`, `ESS_PERMISSION`, `ESS_OVERTIME`, `ESS_ATTENDANCE_CORRECTION`, `ESS_LEAVE_CANCELLATION`). Throws on a second PENDING request for the same record (duplicate protection). |
| `processApproval({tenantDb, requestId, approverId, action: 'APPROVED'\|'REJECTED', notes})` | Decisions → `{APPROVED\|REJECTED\|NEXT_STEP\|WAITING_PARALLEL}` |
| `cancelApprovalRequest` | Pending cancellation |
| `getApprovalStatus(tenantDb, formType, recordId)` | Detail projection |
| `getPendingApprovalsForApprover(tenantDb, employeeId, formType?)` | The approval inbox (already exposed as `GET /api/mobile/v1/approval-requests/me`) |

Supporting models (tenant schema, all existing): `ApprovalFlow`
(unique `formType`, writeback config), `ApprovalFlowStep`
(`ApproverType`: ROLE | SPECIFIC_USER | **DIRECT_MANAGER** | DEPARTMENT_HEAD;
SERIES/PARALLEL), `ApprovalRequest`, `Approval`, `ApprovalHistory`
(append-only), `NumberingSequence` + `NumberingSequenceCounter`,
`FileAttachment`, `Notification`. Event hooks:
`emitApprovalEvent` publishes `{formType}.approval.requested|step.approved|
completed|rejected|cancelled` — the notification hook point.

## 2. Proposed Prisma additions (tenant schema)

Timestamps UTC; all rows employee-scoped; no duplicate employee/org tables
(BRD §8).

```prisma
enum EssRequestType { LEAVE PERMISSION OVERTIME ATTENDANCE_CORRECTION LEAVE_CANCELLATION }
enum EssRequestStatus { SUBMITTED IN_REVIEW RETURNED APPROVED REJECTED CANCELLED COMPLETED }
enum HalfDay { NONE FIRST SECOND }
enum LeaveUnit { DAYS HOURS }
enum LeaveTxKind { ACCRUAL USAGE REVERSAL ADJUSTMENT }

model LeaveType {
  id                String     @id @default(cuid())
  code              String     @unique
  name              String
  unit              LeaveUnit  @default(DAYS)
  halfDayAllowed    Boolean    @default(false)
  requiresAttachment Boolean   @default(false)
  consumesBalance   Boolean    @default(true)
  maxConsecutiveDays Int?
  isActive          Boolean    @default(true)
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  balances LeaveBalance[]; transactions LeaveTransaction[]; leaveRequests LeaveRequest[]
}

model LeaveBalance {           // summary — ledger below is the truth
  id String @id @default(cuid())
  employeeId String; leaveTypeId String; period String   // e.g. "2026"
  entitled Decimal @db.Decimal(8,2); used Decimal @db.Decimal(8,2)
  pending Decimal @db.Decimal(8,2); adjusted Decimal @db.Decimal(8,2)
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@unique([employeeId, leaveTypeId, period])
}

model LeaveTransaction {       // append-only ledger (BRD §8)
  id String @id @default(cuid())
  employeeId String; leaveTypeId String
  kind LeaveTxKind; units Decimal @db.Decimal(8,2)
  requestId String?; note String?; occurredAt DateTime @default(now())
  @@index([employeeId, leaveTypeId])
}

model EssRequest {             // common identity + lifecycle (BRD §6/§8)
  id String @id @default(cuid())
  requestNo String @unique                          // NumberingSequence code "ESS-REQ"
  type EssRequestType
  employeeId String; companyId String; departmentId String?
  status EssRequestStatus @default(SUBMITTED)
  submittedAt DateTime @default(now())
  decidedAt DateTime?; finalizedAt DateTime?
  reason String @db.Text
  workingDays Decimal? @db.Decimal(8,2)             // server-computed (leave)
  expectedHours Decimal? @db.Decimal(6,2)           // server-recomputed (overtime)
  idempotencyKey String
  approvalRequestId String?                          // → ApprovalRequest.id
  originalRequestId String?                          // cancellation/correction link
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@unique([employeeId, idempotencyKey])
  @@index([employeeId, status]); @@index([type])
}

model LeaveRequest {           // 1:1 EssRequest(type=LEAVE)
  requestId String @id; leaveTypeId String
  startDate DateTime; endDate DateTime; halfDay HalfDay @default(NONE)
  request EssRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  leaveType LeaveType @relation(fields: [leaveTypeId], references: [id])
}
model PermissionRequest {      // 1:1 EssRequest(type=PERMISSION)
  requestId String @id; permissionCode String      // configurable type (sick/family/late/…)
  date DateTime; startTime DateTime?; endTime DateTime?   // time-window types
  request EssRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
}
model OvertimeRequest {        // 1:1 EssRequest(type=OVERTIME)
  requestId String @id
  date DateTime; startTime DateTime; endTime DateTime
  workDescription String @db.Text; locationText String?; projectId String?
  reconciledHours Decimal? @db.Decimal(6,2)          // filled by attendance reconciliation
  request EssRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
}
model AttendanceCorrectionRequest {  // 1:1 EssRequest(type=ATTENDANCE_CORRECTION)
  requestId String @id
  attendanceDate DateTime; originalTime DateTime?; requestedTime DateTime
  explanation String @db.Text
  correctedEventId String?                            // set on COMPLETED — links the amendment
  request EssRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
}
```

**Attachments**: no new table — reuse `FileAttachment`
(`entityType = "EssRequest"`, `entityId = requestId`, `uploadedById` = token
employee). **DRAFT**: no server state (client-local drafts, adaptation §7).

### 2.1 Engine extensions the backend must add (small, additive)

1. **`RETURNED` action** in `processApproval`: `action: 'RETURNED'` appends an
   `ApprovalHistory` row (`action: 'RETURNED'` — extend the usage of the
   existing `ApprovalStatus` by writing the history row and keeping
   `Approval.status = PENDING`), sets `EssRequest.status = RETURNED`, leaves
   the `ApprovalRequest` PENDING at the current step, notifies the employee.
   `POST /ess/requests/:id/resubmit` sets the record back to `IN_REVIEW` and
   re-notifies the current approvers; **history is never rewritten** (BRD §5).
2. **Status mapping** — record status is authoritative for the client;
   engine status maps: `PENDING` → record `SUBMITTED` (step 1) / `IN_REVIEW`
   (step > 1) / `RETURNED` (after a return), `APPROVED` → record `APPROVED`,
   `REJECTED` → `REJECTED`, `CANCELLED` → `CANCELLED`; `COMPLETED` only after
   ledger writeback/reconciliation (§3.4).
3. **Notification dispatch** — a subscriber on `emitApprovalEvent` writes
   `Notification` rows for submit/step/decide to the employee + current
   approvers, and optionally POSTs to the configured WHOTIF URL/token
   (BRD §7; backend configuration, retry handled by the notifier).

## 3. Server rules (authoritative — BRD §4 mapped)

1. **Submission** (all four types): validate required fields + ranges;
   `Idempotency-Key` header must equal body `idempotencyKey` (else 400);
   existing `(employeeId, idempotencyKey)` → return the ORIGINAL request
   (200, no second row, no second flow); `requestNo` from the
   `NumberingSequence` row `ESS-REQ` (lock the counter row, increment — no
   helper exists yet); then `startApprovalFlow` with
   `requestedById = context.employeeId` and `recordData` for step conditions
   (e.g. `{ workingDays, expectedHours }`).
2. **Leave specifics** (BRD §4.1): `end >= start`; `halfDay != NONE` only
   when the type allows it AND start == end; **overlap check** against the
   same employee's SUBMITTED/IN_REVIEW/APPROVED leave of any consuming type
   whose `[startDate, endDate]` intersects → domain error `overlap`;
   `workingDays` computed server-side (weekends + company holiday calendar)
   and stored; **balance check at submit** (`entitled − used − pending ≥
   requested`, `consumesBalance` types only) → `insufficient_balance`;
   `pending` increased at submit, converted to `used` by the final-approval
   writeback (same DB transaction; **re-check at approval** — a
   race-lost request is rejected with `insufficient_balance`, not silently
   approved).
3. **Rejection/cancellation reversals** (BRD §4.1): REJECTED/CANCELLED
   requests release `pending` (ledger `REVERSAL` row) — entitlement is never
   permanently consumed.
4. **Approval writeback / finalize** (BRD §5/§11): final APPROVED → in ONE
   transaction: `LeaveTransaction` (USAGE) + `LeaveBalance` update (leave),
   attendance-planning flag (leave/permission), overtime record stays
   `APPROVED` (planned) until reconciliation fills `reconciledHours` and
   moves it to `COMPLETED` — **planned hours are never auto-payable**
   (BRD §4.3); corrections on approval set `correctedEventId` + `COMPLETED`
   **without ever mutating the original attendance event** (BRD §4.4 — the
   amendment is the new linked record).
5. **Overtime** (BRD §4.3): `endTime > startTime`, expected hours
   recomputed server-side, clash check against schedule + existing approved
   OT for the same date → `schedule_conflict`.
6. **Corrections** (BRD §4.4): `attendanceDate` + `requestedTime` required;
   `originalTime` echoed from the record the client read; the engine's
   writeback links the approved amendment.
7. **Decisions** (BRD §5): approver must hold a PENDING `Approval` row for
   the `requestId` (else 403 `protected_field`); **self-approval blocked**
   when `approverId == requestedById` unless the flow step explicitly
   configures an audited exception → domain error
   `self_approval_forbidden`; repeat decisions are idempotent — the second
   call returns the recorded result with `status_conflict`; `notes` required
   for `REJECTED` and `RETURNED` (400 otherwise); every action appends
   `ApprovalHistory` + `recordAudit`.
8. **Cancellation** (BRD §4.1): SUBMITTED/IN_REVIEW/RETURNED →
   `cancelApprovalRequest` + record `CANCELLED`; APPROVED **leave** → creates
   a new `ESS_LEAVE_CANCELLATION` request (same flow, `originalRequestId`
   set) whose approval performs the reversal ledger writeback; APPROVED
   overtime/correction → 409 `status_conflict` (cancel window passed).
9. **Inbox scope** (BRD §5): `getPendingApprovalsForApprover` is the ONLY
   source — an approver sees exactly the requests where they hold a PENDING
   slot; no employee, department or company filter may widen it.

## 4. Endpoints

All `authType: 'mobile'`, `{success,data}` envelope, rate-limited per
employee+route (suggest 20 submits/min, 60 reads/min).

| Method | Path | Purpose |
|---|---|---|
| GET | `/ess/leave/types` | Active leave types (BRD §4.1) |
| GET | `/ess/leave/balances` | Balances with `entitled/used/pending/available` per type for the current period |
| POST | `/ess/leave/requests/preview` | `{leaveTypeId, startDate, endDate, halfDay}` → `{workingDays, overlap: bool, available}` — no writes |
| POST | `/ess/leave/requests` | Submit leave — multipart (below) |
| POST | `/ess/permission/requests` | Submit permission — multipart |
| POST | `/ess/overtime/requests` | Submit overtime — multipart |
| POST | `/ess/attendance-corrections` | Submit correction — multipart |
| GET | `/ess/requests` | Own history: `?status&type&limit(max100, default30)` — BRD §4.5 projection: requestNo, type, submittedAt, period, status, approverName (current), decidedAt, returnReason, attachmentCount |
| GET | `/ess/requests/:id` | Detail: record + type payload + approval steps (current highlighted) + `ApprovalHistory` timeline (actor/action/notes/createdAt) + attachments metadata; 404 for other employees' rows |
| POST | `/ess/requests/:id/cancel` | `{reason}` — §3.8 semantics |
| POST | `/ess/requests/:id/resubmit` | RETURNED only — multipart (updated fields + optional files); keeps history; back to IN_REVIEW |
| GET | `/ess/requests/:id/attachments/:attachmentId` | Authorized download as JSON `{file: {base64, fileName, mimeType}}` (the device transport is JSON-only; ≤5 MB files make this practical). Requester, current approver, HR role; others 404 |
| GET | `/ess/approvals/inbox` | Pending approvals for the token employee (`?formType`) → items: requestId, requestNo, type, employeeName, submittedAt, period/hours projection, currentStepName, ageDays |
| GET | `/ess/approvals/:requestId` | Approver detail: record + timeline + the employee's previous requests count (context) |
| POST | `/ess/approvals/:requestId/decision` | `{action: 'APPROVED'\|'REJECTED'\|'RETURNED', notes?}` → §3.7; response `{requestId, action, recordStatus, nextStepName?}` |

### 4.1 Multipart submit shape (single atomic call)

`Content-Type: multipart/form-data` with:

- `request` — JSON part, the type payload, **exactly these keys** (anything
  else → 403 `protected_field`; `employeeId`/`status`/`requestNo`/
  `workingDays` are never accepted):

```jsonc
// leave
{ "idempotencyKey": "<16-hex client draft id>", "leaveTypeId": "lt_annual",
  "startDate": "2026-11-02", "endDate": "2026-11-04", "halfDay": "NONE",
  "reason": "Family holiday" }
// permission
{ "idempotencyKey": "…", "permissionCode": "sick", "date": "2026-10-30",
  "startTime": "09:00", "endTime": "13:00", "reason": "…" }
// overtime
{ "idempotencyKey": "…", "date": "2026-10-28", "startTime": "18:00",
  "endTime": "21:00", "reason": "…", "workDescription": "…",
  "locationText": "Warehouse", "projectId": null }
// correction
{ "idempotencyKey": "…", "attendanceDate": "2026-10-27",
  "originalTime": "08:00", "requestedTime": "07:58",
  "explanation": "Scanner was down at the gate" }
```

- `files` — 0–3 parts (`filename`, bytes; `image/*` or `application/pdf`,
  ≤ 5 MB each; else `attachment_too_large` / `unsupported_type`; leave types
  with `requiresAttachment` → `attachment_required`). Files become
  `FileAttachment` rows linked to the created `EssRequest` in the same
  transaction.

Response: `{ "success": true, "data": { "request": <5.1>,
"serverTime": "…" } }` — HTTP 200 in all success paths; domain failures use
`{ "success": false, "error": "<domain code>", "message": "…" }` with 409
(`overlap`, `insufficient_balance`, `schedule_conflict`, `status_conflict`,
`self_approval_forbidden`) or 400 (`validation`, `attachment_required`,
`attachment_too_large`, `unsupported_type`).

### 4.2 `GET /ess/leave/types` / `balances`

```jsonc
{ "types": [ { "id": "lt_…", "code": "ANNUAL", "name": "Annual leave",
    "unit": "DAYS", "halfDayAllowed": true, "requiresAttachment": false,
    "consumesBalance": true } ] }
{ "balances": [ { "leaveTypeId": "lt_…", "code": "ANNUAL", "name": "Annual leave",
    "unit": "DAYS", "period": "2026", "entitled": 12, "used": 6, "pending": 1, "available": 5 } ] }
```

### 4.3 Permission types

Permission types are configurable per tenant: serve them inside
`/ess/leave/types` response as a second array `permissionTypes`
(`{code, name, requiresAttachment, consumesBalance, isTimed}`) — sick,
family, late/early (`isTimed`), emergency, plus company-defined rows.

### 4.4 Approvals inbox item

```jsonc
{ "requestId": "…", "requestNo": "ESS-REQ-2026-000123", "type": "LEAVE",
  "employee": { "id": "…", "name": "Budi Santoso", "department": "Operations" },
  "submittedAt": "…", "period": { "start": "2026-11-02", "end": "2026-11-04", "halfDay": "NONE" },
  "reason": "…", "currentStepName": "Direct manager", "ageDays": 2,
  "hasAttachments": true }
```

### 4.5 Request projection (history + detail)

```jsonc
{ "id": "…", "requestNo": "ESS-REQ-2026-000123", "type": "LEAVE",
  "status": "IN_REVIEW", "submittedAt": "…", "decidedAt": null,
  "reason": "…", "workingDays": 3, "expectedHours": null,
  "period": { … }, "payload": { /* type payload, server-known fields only */ },
  "currentStepName": "HR review", "approverName": null,
  "returnReason": null, "attachmentCount": 1, "attachments": [ { id, fileName, mimeType, size } ],
  "timeline": [ { "stepName": "Direct manager", "action": "APPROVED",
      "actorName": "Sari Admin", "notes": "OK", "createdAt": "…" } ],
  "originalRequestNo": null }
```

## 5. Security test matrix (BRD §10/§11 — release-blocking for the backend)

| # | Scenario | Expected |
|---|---|---|
| 1 | Token A reads `GET /ess/requests/:id` of employee B | 404 (no existence leak) |
| 2 | Payload contains `employeeId`/`status`/`requestNo`/`workingDays` | 403 `protected_field`; no row |
| 3 | Same `idempotencyKey` replayed ×5 | ONE record + ONE flow; responses return the original `requestNo` |
| 4 | Overlapping leave while a prior request is SUBMITTED | 409 `overlap` |
| 5 | Leave beyond available balance (submit and again at approval) | 409 `insufficient_balance`, no ledger write |
| 6 | Employee decides on a request they did not submit | record unchanged (engine has no slot) → 403 |
| 7 | Manager decides on an employee outside their approval slots | inbox never lists it; direct POST → 403 |
| 8 | Approver tries to approve their own request (no exception configured) | 409 `self_approval_forbidden` |
| 9 | Repeat APPROVE after completion | `status_conflict`; no duplicate ledger rows (idempotent) |
| 10 | Client submits `status: "APPROVED"` / forges `decidedAt` | ignored/rejected; server transitions only |
| 11 | Attachment download by an unrelated employee | 404; medical files never appear in other employees' projections |
| 12 | RETURNED → resubmit twice / resubmit an APPROVED request | history retained once; 409 `status_conflict` for the wrong state |
| 13 | Cancel a SUBMITTED request then approve it from a stale inbox | decision → `status_conflict`; record stays CANCELLED |
| 14 | Overtime overlapping an approved OT of the same employee | 409 `schedule_conflict` |
| 15 | Corrections never update `AttendanceEvent` rows | amendment only; original row byte-identical (assert in test) |

Client-side companion assertions (this repo, mocked): submit bodies contain
only the allowlisted keys, `Idempotency-Key` == body key == draft id,
responses are zod-stripped, status/decision state comes only from the
server.

## 6. Backend delivery checklist

1. Prisma models (§2) + migration on the tenant schema; seed
   `NumberingSequence` row `ESS-REQ` and at least one `ApprovalFlow` per
   `formType` (DIRECT_MANAGER first step is the default expectation).
2. Engine extensions (§2.1): RETURNED action, status mapping helper,
   notification subscriber (in-app + optional WHOTIF webhook).
3. The 15 routes (§4) on `createRouteHandler({ authType: 'mobile' })` with
   the multipart helper for submits; rate limiting via
   `lib/external-api/rate-limiter.ts`.
4. Ledger/writeback transactions (§3.2–§3.6) and reconciliation fields.
5. Run the §5 matrix as automated tests; attach results to the release.
6. Admin/HR surfaces (type config, flow config, balance accrual) via the
   existing tenant admin — out of ESS scope but required for data.

## 7. Documented adaptations vs the BRD

- Paths `/api/ess/*` → `/api/mobile/v1/ess/*` (Phase 1 convention).
- `DRAFT` (BRD §6) is client-local only — the server models SUBMITTED onward.
- `COMPLETED` requires the reconciliation writeback (§3.4); until
   reconciliation runs, overtime stays `APPROVED` — planned ≠ payable
   (BRD §4.3).
- Notifications: server dispatch (engine events → Notification rows +
   optional WHOTIF); the ESS client surfaces status via request history, not
   a notifications inbox (optional follow-up).
- BRD §9 admin endpoints (device listing etc.) do not apply to the ESS
   client; HR/manager configuration lives in the tenant admin.
