# ESS Phase 4 — Leave, Permission & Overtime Requests

Records the Phase 4 delivery of the WEHA ESS application: leave and
permission requests, overtime and attendance-correction requests,
consolidated request history with cancel/resubmit, attachments, and the
mobile manager approval inbox. The backend interface is
`docs/ESS-REQUESTS-CONTRACT.md` (`weha-framework` was not modified —
same pattern as Phases 2/3). BRD: "ESS BRD Phase 4" v1.0 (cited as §N).

## 1. Summary

Phase 4 moves the ESS client from profile/attendance into **transactions and
approval workflows**. The client is built against a contract that reuses the
backend's **existing approval engine** (`lib/workflow/approval-engine.ts`:
formType-driven flows, DIRECT_MANAGER/ROLE approvers, writeback,
`ApprovalHistory`, duplicate-pending protection) — the backend work is the
record models, ESS endpoints, and two small engine extensions (RETURN action,
notification dispatch), not a second workflow system.

Delivered request types: **Leave** (balances, half-day, server preview),
**Permission** (configurable types incl. timed late/early), **Overtime**
(planned hours; payable only after reconciliation), **Attendance
correction** (amendments — original events never modified), plus
**LEAVE_CANCELLATION** for approved leave. Offline: forms support
device-local drafts; submissions always require the network because all
validation is server-side (BRD §4.1/§7).

## 2. What was implemented

| Deliverable | Files | Notes |
|---|---|---|
| Requests API contract (backend deliverable) | `docs/ESS-REQUESTS-CONTRACT.md` | Reuse of the approval engine (cited), proposed Prisma (`EssRequest` + per-type details, `LeaveType/LeaveBalance/LeaveTransaction`, `FileAttachment` reuse), 15 endpoints under `/api/mobile/v1/ess/*`, atomic multipart submits (`request` JSON + `files[]`), engine extensions (RETURNED, status mapping, notification subscriber), server validation rules, 15-case security matrix |
| Permission + nav | `src/auth/permissions.ts`, `src/db/migrations/0027_ess_approve_permission.ts`, `src/app/nav.config.ts` | New `ess.approve` key (granted admin/manager/operator like `ess.use` — the server remains the scope authority); Approvals nav entry |
| Multipart transport | `src/integration/ess/core.ts` | `uploadJson()` — the single submit shape (JSON `request` field + `files[]`, longer timeout); `EssApiError.domainCode` preserves server domain codes (`overlap`, `status_conflict`, …) |
| Requests client | `src/integration/ess/requests.ts` | `EssRequestsApi`: types/balances/preview, four submits (idempotency key = local draft id), history/detail/cancel/resubmit, base64 attachment download, inbox/approval detail/decision — zod `.strip()` + Decimal coercion |
| Domain | `src/lib/ess/requests/{validation,view-model,working-days,drafts}.ts` | Client validation mirror (dates, half-day single-day, 16 h overtime cap, correction rules, attachments ≤3 × 5 MB images/PDF), status/type labels + period formatting + timeline projection, display-only weekday estimate, kv-backed drafts (durable via `db.flush`, capped 10) |
| Hooks | `src/hooks/{useLeave,useRequests,useApprovals}.ts` | Phase 2/3 state-machine + session-expiry conventions; server-authoritative data; detail/cancel/resubmit/decide actions |
| Pages | `src/app/{leave,requests,approvals}/page.tsx` | Leave: balance cards + form dialog (server preview, balance warnings, drafts) + own list. Requests: status/type filters, consolidated list, detail dialog (timeline, attachments with download, cancel, resubmit), type-picker → permission/overtime/correction forms. Approvals: server-scoped inbox (oldest first, age urgency), detail with Approve/Return/Reject (comment required for reject/return) |
| Components | `src/components/ess/requests/*` | balance-card, attachment-picker (+`toFileParts`), leave-form, request-form (type-driven), request-list, request-detail, approval-inbox-list, approval-detail |
| Dashboard | `src/components/ess/widgets/requests-summary-widget.tsx`, `registry.ts` | `pending-actions` placeholder replaced with a real **My requests** widget (pending count + latest rows; local accounts get a sign-in prompt — no fabricated data) |

Tests: **40 new unit tests** (requests-client 12, validation 13, drafts 6,
view-model 5, working-days 3, + widget/nav/permission updates) and **16 new
e2e** (`ess-leave` 6, `ess-requests` 5, `ess-approvals` 5) against a
stateful mock (`tests/e2e/helpers/requests-mock.ts`) that implements the
contract's server-side filtering, multipart submits, and workflow outcomes.

## 3. Adaptations vs the BRD

- **Paths**: BRD §9 `/api/ess/*` → `/api/mobile/v1/ess/*` (Phase 1 convention).
- **`DRAFT` (BRD §6)** is client-local only (kv drafts, device-scoped); the
  server models SUBMITTED onward. Drafts are never counted as requests.
- **Status model**: the 7 BRD statuses live on the `EssRequest` record;
  `COMPLETED` only after ledger writeback/reconciliation (contract §3.4) —
  planned overtime hours are never auto-payable (BRD §4.3).
- **Notifications (BRD §11 item 10)**: server dispatch (engine events →
  `Notification` rows + optional WHOTIF webhook) — a contract requirement;
  the client's status surface is request history + the dashboard widget (a
  notifications inbox UI is optional follow-up).
- **Attachments**: one atomic multipart submit (`request` + `files[]`) rather
  than pre-uploaded files; downloads travel base64 inside JSON (the device
  transport is JSON-only; ≤5 MB keeps this practical).
- **Approvals scope**: the inbox is exactly `getPendingApprovalsForApprover`
  (token employee) — `ess.approve` only gates the screen; a non-approver sees
  an honest empty state.
- **BRD §9 admin endpoints** (device listing/heartbeat) belong to the tenant
  admin, not the ESS client.
- **Attendance reconciliation** (§4.3/4.4 finalize) is server-side; the client
  renders `COMPLETED`/`reconciledHours` when the backend produces them.

## 4. Acceptance evidence (BRD §11 checklist)

Status: ✅ delivered & verified here · ✅/⏳ client done, **real integration
pending backend** · ⏳ pending backend (release-blocking) · ⛔ env-blocked.
Mocked tests are not production proof (BRD §11 convention).

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Employees view leave types and balances | ✅/⏳ | `/leave` renders server types + balances (e2e `ess-leave` #1); backend endpoints pending |
| 2 | Submit leave, permission, overtime, correction | ✅/⏳ | All four submit through the contract's multipart shape (e2e leave #2/#6, requests #5; unit `requests-client`); backend pending |
| 3 | Server rejects invalid dates / unauthorized / overlapping leave | ✅/⏳ | Client mirror validation blocks bad input without a call (e2e #3); server overlap + authz are contract §3.2/§5 rows 3–5 ⏳ |
| 4 | Requests follow the configurable approval route | ⏳ | Purely server-side (approval flows); client renders the resulting steps/timeline |
| 5 | Managers cannot view/approve outside their scope | ⏳ | Inbox = engine-scoped query (contract §3.9/§5 rows 6–7); client cannot widen it |
| 6 | Employees track status and read decision comments | ✅ | History + detail timeline with actor/action/comments + return reasons (e2e requests #1–#3) |
| 7 | Approved leave updates balance/attendance exactly once | ⏳ | Server ledger writeback in one transaction + idempotent decisions (contract §3.2–3.4/§5 rows 5, 9) |
| 8 | Approved overtime reconciled before payroll handoff | ⏳ | `reconciledHours` + COMPLETED transition (contract §3.4); planned ≠ payable (client copy states this) |
| 9 | Corrections preserve original events | ⏳ | Server amendment model (contract §3.6/§5 row 15); client UI states the original is never modified |
| 10 | Notifications delivered with retry handling | ⏳ | Engine event subscriber + Notification rows + optional WHOTIF webhook (contract §2.1) |
| 11 | Audit history captures changes and decisions | ✅/⏳ | `ApprovalHistory` timeline rendered (e2e); audit rows are server-side (contract §3.7) |
| 12 | Responsive web/PWA + supported Android | ✅/⛔ | PWA verified on Chromium (46/46 e2e); **Android SDK-blocked** (same env blocker as Phases 1–3) |

### Verification (all green at handover)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| `npm run test:run` | **50 files / 382 tests pass** |
| `NODE_ENV=production npm run build` | pass — 35 static pages |
| `npx playwright test` | **46 tests pass** (30 pre-existing + 16 Phase 4) |

## 5. Open items / next phase

1. **Backend build** of `docs/ESS-REQUESTS-CONTRACT.md` — record models, the
   15 routes, the RETURNED engine extension, notification dispatch, numbering
   seed (`ESS-REQ`), and one `ApprovalFlow` per formType; then re-run the
   e2e specs against a real deployment and promote the ⏳ items. The §5
   security matrix is release-blocking.
2. Overtime reconciliation + payroll handoff (BRD 4.5) — backend/Compensation
   phases.
3. Optional: notifications inbox UI (server events already spec'd), HR
   additional-approval display beyond the engine steps, delegation flows.
4. Android release pass (SDK-blocked): on-device forms, file picker,
   Capacitor camera for future QR-in-requests features.
