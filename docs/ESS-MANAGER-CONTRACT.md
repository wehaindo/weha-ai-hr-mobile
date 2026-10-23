# ESS Manager & Approvals API Contract — for the WEHA HRD backend

Target implementation: **`weha-ai-hrd`** (port 3278 — the HRD app owning the
approval engine, HR request models, attendance and payroll; see
`docs/ESS-PAYROLL-CONTRACT.md` §1 for the deployment note). Same conventions
as `docs/ESS-API-CONTRACT.md`: `createRouteHandler({ authType: 'mobile' })`
(employee = `context.employeeId`, never a request value), `{success,data}`
envelope, `MOBILE_CORS_HEADERS`, rate limiting via
`lib/external-api/rate-limiter.ts`, audit via `recordAudit`.

**This document is authoritative for approvals/manager scope (Phase 6,
BRD "Manager Self-Service & Approval Workflow").** It consolidates and
extends the approvals endpoints first specced in
`docs/ESS-REQUESTS-CONTRACT.md` §4; both older contracts carry pointer notes.

## §1 Record-model consolidation (read first)

BRD §7: reuse existing models, no duplicate masters. The ESS request records
are the HRD schema's own tables, driven through the existing approval engine
(`lib/workflow/approval-engine.ts`, `formType` per request type):

| BRD requirement | Existing model (weha-ai-hrd tenant schema) | Notes |
|---|---|---|
| FR-603 leave approval | `LeaveRequest` (leaveTypeId, startDate/endDate, `requestedDays Decimal(8,2)`, reason, `state: RequestState`, submittedAt/decidedAt) + `LeaveType/LeavePolicy/LeaveAllocation/LeaveTransaction` | Ledger writeback on final approval |
| FR-604 attendance correction | `AttendanceCorrection` (type, before/after Json, targetPunchId, `state`, decidedById/appliedAt) + raw **`AttendancePunch`** (punchAt, source, dedupeKey, rawPayload) + `Attendance` per-day record + `Shift*` schedule | **Punches are immutable evidence** — approval creates/advances the correction; recalculation via job |
| Approval routing/steps/decisions/history | `ApprovalFlow/ApprovalFlowStep/ApprovalRequest/Approval/ApprovalHistory` + HRD `approval-hooks.ts`/`approval-gate.ts` | Writeback seam: `runApprovalOutcome` / `runApprovalGuard` / `revertSlotDecision` |
| Durable jobs | `BackgroundJob` (state, runAt, attempts, maxAttempts) | Reminders/escalation/notification retries (no BullMQ needed) |

**Superseded proposals**: the record-model sections of
`docs/ESS-ATTENDANCE-CONTRACT.md` §2 (`EssRequest`, per-type tables,
`AttendanceCorrectionRequest`) and `docs/ESS-REQUESTS-CONTRACT.md` §2 are
**not to be implemented** — those contracts' *endpoints/semantics* remain
valid but map onto the models above, and their approvals endpoints are
extended by §4 here. (No backend had started against them: both contracts
carry this note at the top.)

Status enums gain `RETURNED` (see §2) for both `RequestState` and
`AttendanceCorrectionState` — the one enum change the consolidation needs.

## §2 Engine extensions (backend, additive)

1. **`RETURNED` action** in `processApproval` (`action: 'RETURNED'`): writes
   an `ApprovalHistory` row (action RETURNED + comment), sets the record
   `state = RETURNED`, leaves `ApprovalRequest.status = PENDING` at the
   current step, notifies the employee. Resubmission
   (`POST /ess/requests/:id/resubmit`, Phase 4 path) returns the record to
   review **and increments `version`** — add
   `version Int @default(1)` to `LeaveRequest` and `AttendanceCorrection`.
   History is never rewritten; each resubmission is a traceable version
   (BRD FR-605).
2. **Decision concurrency** (BRD §5 rules 1–3):
   - the task must be `PENDING` and assigned to the acting employee **or an
     active delegate** (§3);
   - `Idempotency-Key` header on `POST …/decision` → a replay returns the
     original result (same body, HTTP 200), never a second decision;
   - body carries `expectedVersion` — mismatch against the record's current
     `version` → **409 `version_conflict`** (client reloads and re-reviews);
   - the Approval slot row is locked inside the existing transaction so
     concurrent decisions collapse to exactly one.
3. **`ApprovalHistory` ALTERs** (FR-608): `correlationId String?`,
   `recordVersion Int?`, `delegatorId String?` — written on every decision.
4. **SLA**: `ApprovalFlowStep.slaHours Int?` — a task is `overdue` when
   `created + slaHours < now` (computed in queries; projected as
   `overdue: true`). Deadlines **never** auto-approve (BRD FR-606);
   overdue only drives reminders + escalation.

## §3 Delegation model (BRD FR-606)

```prisma
model ApprovalDelegation {
  id          String   @id @default(cuid())
  delegatorId String            // the approver granting authority
  delegateId  String            // the substitute
  startsAt    DateTime
  endsAt      DateTime           // time-bounded — never permanent
  formTypes   String[]?          // null = all forms the delegator may act on
  isActive    Boolean  @default(true)
  createdById String?
  createdAt   DateTime @default(now())
  @@index([delegateId, isActive])
  @@index([delegatorId, isActive])
}
```

- Inbox resolution (`getPendingApprovalsForApprover` extension): include
  slots of the token employee **and** slots of active delegators whose
  window covers now and whose `formTypes` match.
- A decision under delegation must resolve the slot to the delegator's
  assignment; `ApprovalHistory.delegatorId` records the original approver.
- Delegation outside its window/scope is invisible (not "denied" — never
  listed). Configuration UI lives in the tenant admin (out of ESS scope).

## §4 Endpoints (`/api/mobile/v1/ess/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/ess/manager/dashboard` | BRD FR-601 summary |
| GET | `/ess/manager/team?search=&cursor=&limit=` | Paginated authorized team (≤50) |
| GET | `/ess/approvals?formType=&status=&overdue=&q=&cursor=&limit=` | FR-602 inbox: **server-side filters + cursor pagination** (≤50) |
| GET | `/ess/approvals/:requestId` | FR-602/603/604 detail with contexts |
| POST | `/ess/approvals/:requestId/decision` | Approve / reject / return (§2 semantics) |
| GET | `/ess/delegations?scope=inbound\|outbound` | FR-606 read-only delegation rules |
| GET | `/ess/requests/:id/history` | Authorized workflow history (restated from Phase 4) |

### 4.1 `GET /ess/manager/dashboard`

Scope = employees with `managerId = token employee` + departments where
`Department.managerId = token employee` (one-hop, matching the engine's
approver resolution). **Field whitelist: name, department, today attendance,
pending counts — no salary, phone, or other personal data (BRD §8).**

```jsonc
{ "success": true, "data": {
  "teamCount": 8, "pendingCount": 3, "completed30d": 12, "rejected30d": 1, "overdueCount": 1,
  "team": [ { "employeeId": "…", "name": "Budi Santoso", "department": "Operations",
    "todayAttendance": { "status": "PRESENT", "checkIn": "08:01", "checkOut": null }, // null → not yet calculated
    "pendingCount": 1 } ],
  "serverTime": "…"
} }
```

`todayAttendance` derives from the HRD `Attendance` row for the current work
date (`status: PRESENT|LATE|ABSENT|ON_LEAVE|HALF_DAY|HOLIDAY|REST_DAY|
INCOMPLETE`); `null` when nothing is calculated yet — the client shows an
honest "not yet calculated" state (never fabricated).

### 4.2 `GET /ess/manager/team`

`{ team: [<4.1 team row>], nextCursor: "…" | null }` — same scope/whitelist;
`search` matches name/employeeNumber (server-side, escaped).

### 4.3 `GET /ess/approvals` (FR-602 — supersedes the Phase 4 inbox shape)

Item = Phase 4 projection **plus**:

```jsonc
{ "requestId": "…", "recordId": "…",           // ApprovalRequest id → record id
  "requestNo": "…", "formType": "LEAVE",
  "employee": { "id": "…", "name": "Budi Santoso", "department": "Operations" },
  "submittedAt": "…", "period": { … }, "reason": "…",
  "currentStepName": "Direct manager", "ageDays": 2,
  "overdue": false, "version": 1, "hasAttachments": true }
```

Filters: `formType` (LEAVE | ATTENDANCE_CORRECTION | …), `status` (only
`PENDING` shown by default; `COMPLETED|REJECTED|RETURNED` for history views),
`overdue=true`, `q` (employee name / requestNo). Cursor = opaque
`(createdAt,id)` encoding; response `{ requests: [...], nextCursor }`.

### 4.4 `GET /ess/approvals/:requestId` (FR-603/604 contexts)

Phase 4 detail **plus** `recordId`, `version`, `availableActions`
(⊆ APPROVED/REJECTED/RETURNED per policy + comment requirement),
`attachments[]` (same metadata shape as Phase 4 — downloadable through
`/ess/requests/:recordId/attachments/:aid`, authorized for the current
approver), timeline items with `correlationId/recordVersion/delegatorId`,
and exactly one context object:

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
  "originalPunch": { "punchAt": "2026-10-27T08:00:11Z", "punchType": "CHECK_IN",
      "source": "DEVICE", "dedupeKey": "…" },           // read-only evidence
  "schedule": { "shiftName": "Morning (07:00–16:00)" },
  "flags": [ "possible_duplicate" ] }                     // possible_duplicate |
                                                          // missing_punch | schedule_conflict
```

### 4.5 `POST /ess/approvals/:requestId/decision`

Headers: `Idempotency-Key` (= one fresh key per user action attempt).
Body: `{ "action": "APPROVED" | "REJECTED" | "RETURNED", "notes": "…",
"expectedVersion": 1 }` — `notes` required for REJECTED/RETURNED (400).
Response: `{ requestId, action, recordStatus, version, nextStepName? }`.

Writeback (inside `runApprovalOutcome`, one transaction; BRD FR-603/604):

- **Leave, final APPROVED** → `LeaveTransaction` (USAGE) + `LeaveAllocation`
  balance update; `LeaveRequest.state = APPROVED`, decidedAt set. Rejection /
  return release no balance (nothing was consumed before final approval).
- **Correction, APPROVED** → `AttendanceCorrection.state = APPROVED`, then a
  `BackgroundJob(ATTENDANCE_RECALCULATE)` applies it → `APPLIED`;
  **`AttendancePunch` rows are never modified** (BRD FR-604/§9); the
  correction keeps before/after + targetPunchId linkage.
- Rejection/return of either → state REJECTED/RETURNED with the comment.
- Any writeback failure leaves the workflow recoverable (record stays at the
  step; BRD §5 rule 5) — never report success without the committed
  transaction.

### 4.6 `GET /ess/delegations`

`{ delegations: [ { id, direction: "INBOUND" | "OUTBOUND",
counterpart: { id, name }, startsAt, endsAt, formTypes: ["LEAVE"] | null,
isActive } ] }` — active + recently expired windows for the token employee
(both directions; `scope` narrows).

## §5 Notifications, reminders, escalation (BRD FR-606/607)

- Event subscribers (Phase 4/5 pattern): submit, assignment created,
  returned, decided, completed → `Notification` rows (+ optional WHOTIF
  webhook) — payload = requestNo/formType/status only (no personal/salary
  data).
- **Reminder job**: `BackgroundJob(WORKFLOW_REMINDER)` enqueued per task at
  `created + slaHours − reminderOffset`; poller runs
  `state = PENDING AND runAt <= now` (DB cron; ioredis optional, no BullMQ
  dependency). Re-enqueues itself for multi-stage reminders.
- **Escalation job**: `BackgroundJob(WORKFLOW_ESCALATION)` reassigns the
  pending slot to the configured next-level manager or HR per flow config —
  **reassignment only; never an implicit decision** (BRD FR-606). All
  reminder/escalation events append to `ApprovalHistory` (with correlationId)
  so audits show why a task moved.
- **Notification retry**: `NOTIFICATION_DISPATCH` jobs use the queue's
  attempts/maxAttempts — delivery retries never re-run business writeback.

## §6 Security matrix (BRD §3/§8/§9 — release-blocking)

| # | Scenario | Expected |
|---|---|---|
| 1 | Employee with no reports opens `/ess/manager/dashboard` | `teamCount: 0`, empty arrays — no data leak |
| 2 | Parameter tampering (`employeeId`, `managerId`, foreign ids) on dashboard/team | ignored; scope computed only from token employee |
| 3 | Inbox query by an employee holding no slots | empty list (engine slot lookup only) |
| 4 | Decision on a task not assigned to the actor (no delegation) | 403; record unchanged |
| 5 | Decision under a delegation outside its window or formType | task not visible / 403 |
| 6 | Two concurrent decisions on the same slot | exactly one recorded; the loser gets the original result (idempotency) or 409 `version_conflict` |
| 7 | Replay with same `Idempotency-Key` after success | original result, no second history row |
| 8 | `expectedVersion` stale | 409 `version_conflict`, no write |
| 9 | REJECTED/RETURNED without notes | 400 `validation` |
| 10 | Approver attempts self-approval | 409 `self_approval_forbidden` (existing guard) |
| 11 | Record projection contains salary/phone/nik for manager views | absent (whitelist) |
| 12 | Attachment download by a non-approver employee | 404 (existing rule) |
| 13 | Cross-tenant token | unreachable (JWT tenant → db) |
| 14 | Approve a correction and inspect `AttendancePunch` rows afterwards | byte-identical; only `AttendanceCorrection` + `Attendance` recalc change |
| 15 | Leave final approval with failing balance write | no partial state: request stays SUBMITTED-at-step, recoverable, audit row written |
| 16 | Escalation/reminder job runs past deadline | reassignment + history only — status never becomes APPROVED without a decision |

Client-side companion assertions (this repo, mocked): decisions always carry
fresh `Idempotency-Key` + `expectedVersion`, inbox requests carry filters and
cursor, manager views render only whitelisted fields, `version_conflict`
reloads instead of retrying.

## §7 Backend delivery checklist

1. Migrations: `RETURNED` enum values, `version` columns,
   `ApprovalHistory` ALTERs, `ApprovalDelegation`, `ApprovalFlowStep.slaHours`,
   `JobType` additions, `ESS-REQ`-style numbering already in place.
2. Engine: RETURNED action, delegate-aware slot resolution, idempotency +
   expectedVersion checks, writeback hooks (§4.5) inside
   `runApprovalOutcome`.
3. The 7 routes (§4) + rate limits (dashboard/team 30/min, decisions
   30/min) + audits with correlationId.
4. Worker: reminder/escalation/notification-dispatch poller over
   `BackgroundJob`.
5. Run the §6 matrix as automated tests (concurrency test included);
   attach results to the release.
6. Tenant-admin surfaces for delegation/SLA/flow config (out of ESS scope,
   required for data).
