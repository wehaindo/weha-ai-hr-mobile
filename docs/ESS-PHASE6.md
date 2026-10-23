# ESS Phase 6 — Manager Self-Service & Approval Workflow

Records the Phase 6 delivery of the WEHA ESS application: manager dashboard
with team overview, a centralized approval inbox with server-side
filters/pagination, leave and attendance-correction approval contexts,
decision idempotency/versioning, and a read-only delegation view. Backend
interface: `docs/ESS-MANAGER-CONTRACT.md` (target `weha-ai-hrd`).
BRD: "ESS BRD Phase 6" v1.0 (cited as §N).

## 1. Summary

Phase 6 is the manager-facing half of the request lifecycle. It builds on
Phase 4's approval inbox and — critically — **consolidates the contracts**:
the Phase 3/4 proposals for new request tables are superseded because
`weha-ai-hrd` already owns `LeaveRequest`, `AttendanceCorrection`,
`AttendancePunch`, `Shift*` and the (fork-ahead) approval engine with
`approval-hooks`/`approval-gate`. Both older contracts now carry
"superseded" pointer notes; `ESS-MANAGER-CONTRACT.md` §1 is the single
authoritative record model statement (BRD §7: reuse, never duplicate).

## 2. What was implemented

| Deliverable | Files | Notes |
|---|---|---|
| Manager/approvals contract (backend deliverable) | `docs/ESS-MANAGER-CONTRACT.md` | §1 consolidation (reuse HRD tables); engine extensions (RETURNED action, record `version` columns, decision idempotency + `expectedVersion` + row locks, `ApprovalHistory` correlationId/version/delegatorId, `slaHours`); `ApprovalDelegation` model; `BackgroundJob`-based reminder/escalation/notification worker (no BullMQ — the DB queue already exists); 7 endpoints; 16-case release-blocking security matrix |
| Contract back-notes | `docs/ESS-ATTENDANCE-CONTRACT.md`, `docs/ESS-REQUESTS-CONTRACT.md` | Superseding pointers at the top of each |
| Manager API client | `src/integration/ess/manager.ts` | `EssManagerApi`: dashboard, team (search+cursor), delegations — zod `.strip()` with whitelist probes |
| Approvals client upgrades | `src/integration/ess/requests.ts` | `getInbox(filters, cursor)` → `{items, nextCursor}` at `/ess/approvals`; detail gains `recordId/version/availableActions/leaveContext/correctionContext/attachments`; `decide(…, expectedVersion, idempotencyKey)` |
| Domain | `src/lib/ess/manager/view-model.ts`, `src/lib/ess/requests/view-model.ts` | HRD `AttendanceStatus` labels + "Not yet calculated" for null, FR-601 stat cards, delegation windows; approval action labels + comment policy + overdue label |
| Hooks | `src/hooks/useManagerDashboard.ts`, `useApprovals.ts` | Filters + cursor append (ready state preserved during pagination), decisions with per-attempt idempotency key, `version_conflict` → toast + detail reload (never a blind retry) |
| Manager dashboard | `src/app/manager/page.tsx`, `src/components/ess/manager/*` | FR-601: Team/Pending/Completed/Overdue stat cards, team list with today's attendance badge + pending counts, debounced server-side search, Load more, honest non-manager empty state; nav entry `Manager` (`ess.approve`) |
| Approval inbox upgrades | `src/app/approvals/page.tsx`, `approval-inbox-list.tsx`, `approval-detail.tsx`, `delegations-dialog.tsx` | Filter bar (type/status/overdue/search), cursor Load more, overdue badges + department line, **Delegations** dialog (FR-606 view); detail adds authorized attachment download, **leave context** (balance + overlap warning) and **correction context** (before/after, original punch as read-only evidence, schedule, conflict flags), available-actions gating |

Tests: **new unit suites** `manager-client` + `manager-view-model` plus
`requests-client` extensions (filters/cursor, leave+correction contexts,
`version_conflict`), and **11 new e2e** (`ess-manager.spec.ts` 5,
`ess-approvals.spec.ts` +6) against upgraded stateful mocks
(`manager-mock.ts`, `requests-mock.ts` with inbox
filters/cursor/conflict/delegations).

## 3. Adaptations vs the BRD

- **Paths**: BRD §6 `/api/ess/manager|approvals` →
  `/api/mobile/v1/ess/*` (Phase 1 convention).
- **Record models**: BRD §7's `Ess*` models map onto the HRD schema's
  existing tables (contract §1) — no duplicate `EssRequest`; `RETURNED` and
  record `version` columns are the only enum/column additions.
- **Manager scope** resolves one hop (direct reports + managed departments),
  matching the engine's approver resolution; transitive/indirect reports are
  a contract follow-up, not implemented (BRD FR-601 marks them optional).
- **Delegation**: ESS client is **read-only** (FR-606 view endpoint) —
  configuration stays in the tenant HR admin (BRD §2 out-of-scope:
  workflow designer). Decisions under delegation are recorded server-side.
- **Reminders/escalation/notification retry** run on the existing
  `BackgroundJob` DB queue (neither repo has BullMQ; `ioredis` optional).
- **Team attendance** shows the HRD `Attendance` row for today with an
  honest "Not yet calculated" state — never fabricated (BRD FR-601/§8).
- **Salary/personal data** never renders in manager views (contract whitelist
  + zod stripping; e2e leak probes).

## 4. Acceptance evidence (BRD §9)

Status: ✅ delivered & verified here · ✅/⏳ client done, **real integration
pending backend** · ⏳ pending backend (release-blocking) · ⛔ env-blocked.
Mocked tests are not production proof.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Managers see only their authorized team and approval tasks | ✅/⏳ | Server-scope enforced (contract §6 rows 1–3); client renders whatever the server returns, non-managers get the empty state (e2e `ess-manager` #4) |
| 2 | Employees submit supported requests and view status | ✅ | Phase 4 submissions + history (e2e `ess-requests`), status/badges in inbox |
| 3 | Managers approve, reject, return eligible requests | ✅/⏳ | Three actions with comment policy + availableActions gating (e2e approvals #2/#3/#10); eligibility server-side |
| 4 | Rejection/return enforce required reasons | ✅ | Client blocks without comment (e2e #3) + contract §4.5 400 |
| 5 | Configured multi-step routes work | ⏳ | Engine flows (existing) + contract §2; backend integration tests pending |
| 6 | Delegation and escalation follow configured rules | ✅/⏳ | Delegation view shipped (e2e #11); configuration + escalation worker backend (contract §3/§5) |
| 7 | Unauthorized self-approval and cross-tenant access rejected | ⏳ | Contract §6 rows 10/13 (existing engine guard + matrix) |
| 8 | Duplicate/concurrent decisions cannot create inconsistent state | ⏳ | Contract §2.2 idempotency + row locks (client sends keys — unit + e2e #10 assert the header/version) |
| 9 | Approved leave/corrections update business records | ⏳ | Contract §4.5 writeback (ledger transaction; correction → APPROVED + recalc job) |
| 10 | Raw attendance device evidence preserved | ⏳ | Contract §4.5/§6 row 14 — `AttendancePunch` immutable; client renders punch as read-only evidence (e2e #8) |
| 11 | Notification failures retried without duplicating decisions | ⏳ | Contract §5 `BackgroundJob(NOTIFICATION_DISPATCH)` retries decoupled from writeback |
| 12 | Workflow history and audit capture all actions | ✅/⏳ | Timeline with comments rendered (e2e #7); correlationId/version/delegatorId audit fields are contract §2.3 |
| 13 | PWA and Android layouts across screen sizes | ✅/⛔ | PWA verified on Chromium (68/68 e2e); **Android SDK-blocked** (same env blocker as Phases 1–5) |
| 14 | Integration tests verify workflow/authorization/transactions | ⏳ | Backend must attach contract §6 matrix results (incl. concurrency test) |

### Verification (all green at handover)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| `npm run test:run` | **55 files / 416 tests pass** |
| `NODE_ENV=production npm run build` | pass — 36 static pages |
| `npx playwright test` | **68 tests pass** (57 pre-existing + 11 Phase 6) |

## 5. Open items / next phase

1. **Backend build** of `docs/ESS-MANAGER-CONTRACT.md` in `weha-ai-hrd` —
   enum/column migrations, engine RETURNED + concurrency + delegate-aware
   slot resolution, the 7 endpoints, writeback transactions, and the
   reminder/escalation/notification worker — then re-run the e2e specs
   against a real deployment and promote the ⏳ items (§6 matrix is
   release-blocking, concurrency test included).
2. Contract follow-ups: transitive (indirect) report scope, delegation admin
   UI in the tenant admin, `GET /ess/requests/:id/history` consumer UI.
3. Android release pass (SDK-blocked).
