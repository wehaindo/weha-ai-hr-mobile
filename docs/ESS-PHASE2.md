# ESS Phase 2 — Employee Dashboard & Profile

This document records the Phase 2 delivery of the WEHA Employee Self-Service
(ESS) application: the authorized employee profile (view + edit), the
personalized dashboard, the ESS API client, and the acceptance evidence with
per-item status. File paths refer to this repository unless noted.
Phase 1 context: `docs/ESS-PHASE1.md`; backend interface: `docs/ESS-API-CONTRACT.md`.

## 1. Summary

Phase 2 is **client-side delivery against a written contract** (confirmed scope
decision): `weha-framework` was not modified — the backend team implements
`docs/ESS-API-CONTRACT.md` separately. Everything below is tested against
mocked API routes; **mocked tests are not counted as production integration
proof** (BRD §11 convention) — those items are marked *pending backend* in §6.

The employee profile endpoint (`GET /api/mobile/v1/employees/me`) already
exists in weha-framework with the correct security properties (identity from
the JWT, sensitive columns excluded — see contract §1.1); only `PATCH` and the
relation-name select additions are new backend work.

## 2. Scope decisions

1. **`weha-framework` untouched.** Deliverable split: API contract spec (this
   repo) → backend team; client (this repo) built and tested against mocks.
2. **Profile edit = email + phone only.** The `Employee` table has no
   address/photo/emergency-contact columns; BRD: display only fields that
   exist. No schema changes in Phase 2.

## 3. What was implemented

| Deliverable | Files | Notes |
|---|---|---|
| API contract (backend deliverable) | `docs/ESS-API-CONTRACT.md` | Existing endpoints, `PATCH /employees/me` spec (email+phone allowlist, 400/403/409 codes, automatic audit), security test matrix §4, no-dashboard-endpoint decision §3, relation-name request in GET select |
| ESS API client | `src/integration/ess/client.ts` | Twin of `MobileAuthClient`: `bridge.cloud.request` transport, Bearer token via `ensureFreshAccessToken` (5-min skew), `{success,data}` envelope unwrap, typed `EssApiError`, one forced refresh-retry on 401, zod `.strip()` response validation so sensitive fields can never reach state. **Never sends an employee id.** |
| Field policy + view model | `src/lib/ess/profile.ts` | `EDITABLE_PROFILE_FIELDS = ['email','phone']`, `validateProfileForm`, `buildProfilePatch` (changed allowlisted fields only), `toProfileSections` (identity / organization / contact) |
| Profile hook | `src/hooks/useEssProfile.ts` | In-memory only — profile is **never** persisted to SQLite/localStorage (BRD §4.4). Network failure → error + Retry, session kept; `session_expired` → toast + logout + redirect |
| Widget registry | `src/lib/ess/widgets/registry.ts`, `services.ts` | 4 widgets (employee-summary, service-shortcuts, announcements, pending-actions) filtered by permission/enabled and ordered; 7 services: profile/attendance/leave/requests `available` (href required), payslips/documents/announcements `coming` (never linked) |
| Dashboard widgets | `src/components/ess/widgets/*` | Employee summary renders real `getProfile()` data (mobile sessions; local PIN accounts get a "Sign in with WEHA account" state); announcements/pending-actions are clearly-marked unavailable placeholders — no fabricated data (BRD §4.1B) |
| Profile page | `src/app/profile/page.tsx` | Section cards, skeleton, error+Retry, "no employee linked" state, email+phone edit form with contract-mirroring client validation, audit note copy, session-expired → reauth |
| Dashboard page | `src/app/dashboard/page.tsx` | Welcome header from profile (name, employee number, job title, department, status), widget grid, device section kept |
| Retired | `src/lib/ess/employee-context.ts` (+ test) | Phase 1 enrichment stub superseded by the ESS client/hook; no production importers |

## 4. Adaptations vs the BRD

- **No `/api/ess/*` routes.** BRD §5.1 says endpoints are "logical; adapt to
  Phase 1 conventions" — the real convention is `/api/mobile/v1/*`, so the
  client calls `employees/me` only.
- **No dashboard/services endpoints.** Widget/shortcut configuration is the
  client-side registry (same pattern as `src/app/nav.config.ts`, BRD §4.1D);
  dashboard data comes from `GET /employees/me`. A server-driven widget config
  endpoint is spec'd as an optional appendix (contract §3) for when admin
  customization lands — not required for Phase 2.
- **Company/department names** are not in the current GET `select` (only ids):
  the contract requests the additive relation-name change; the client falls
  back to showing ids until it ships.

## 5. Framework fix — durable auth-session writes (`db.flush`)

The e2e suite exposed a real persistence race: SQLite writes are debounced
(`SAVE_DEBOUNCE_MS = 400` in `src/db/engine.ts`) and the unload-time
`pagehide` flush could not finish its async IndexedDB `put` before the page
context died. A `page.goto('/profile')` (full reload) right after mobile
login could therefore boot from a blob **without** the `mobile_auth_sessions`
row → `no_employee_session` error state.

Fix (shipped in this phase):

- New bridge capability `db.flush(): Promise<void>` (`src/platform/bridge.ts`) —
  persisted immediately, bypassing the debounce.
- Implementations: renderer/web/Capacitor (`src/platform/renderer-bridge.ts` →
  `engine.flush()`), Electron main (`electron/ipc/db.ts` `db:flush` handler) +
  preload mirror (`electron/preload.ts`).
- Awaited in `saveMobileSession` and `clearMobileSession`
  (`src/auth/mobile-session.ts`) — login, token rotation and logout writes are
  durable before the caller proceeds; a reload can neither lose the session
  nor resurrect a cleared one.
- The `pagehide`/`visibilitychange` best-effort flush in the engine remains as
  a backstop for all other writes.

Evidence: `tests/e2e/ess-profile.spec.ts` (all 6 tests navigate via full
`page.goto('/profile')` reloads) and `mobile-login.spec.ts`'s reload test pass
reliably; unit coverage in `__tests__/auth/mobile-auth.test.ts`.

## 6. Acceptance evidence (BRD §7 / §11)

Status key: ✅ delivered & verified in this repo · ✅/⏳ client done, **real
integration pending backend** (contract §2) · ⏳ pending backend (release-blocking)
· ⛔ environment-blocked.

| Item | Status | Evidence |
|---|---|---|
| Profile shows own employee record, safe fields only | ✅/⏳ | Client renders `employees/me` (mocked e2e `ess-profile.spec.ts` #1); GET endpoint already exists in weha-framework with safe `select` (verified in source, contract §1.1) — runtime check pending deployment |
| Edit email + phone (BRD §4.3) | ✅/⏳ | e2e #2: PATCH body is exactly `{phone}` + `Authorization: Bearer …`, no id ever; backend `PATCH` pending (contract §2) |
| Protected fields never editable (BRD §6.2 rows 4/11) | ✅/⏳ | No inputs rendered for employee number/department (e2e #6); client allowlist strips non-allowlisted keys (unit `ess-client.test.ts`); **server-side rejection is release-blocking** (contract §4) |
| Employee id only from token, never client-supplied (BRD §3/§6) | ✅/⏳ | Unit: request never contains `employeeId`/unknown keys; e2e #2 body assertion; server enforcement pending (contract §4 rows 3/5) |
| Cross-employee access blocked (§6.2 row 3) | ⏳ | Server-only property — mocked client tests are **not** counted (BRD §11); contract §4 row 3 |
| Tenant isolation (§6.2 row 5) | ⏳ | JWT `tenantId` → `getTenantClientForDevice` on the backend — pending (contract §4 row 5) |
| Expired/revoked token → reauth (§6.2 rows 6/7) | ✅ | e2e #4: 401 on GET+refresh → logout + login screen; refresh with 5-min skew in the client |
| Invalid input rejected without write (§6.2 row 8) | ✅/⏳ | Client blocks invalid email before any request (e2e #3, `profile-mapping.test.ts`); server 400 pending |
| Sensitive fields never in payload (§6.2 row 10) | ✅/⏳ | zod `.strip()` drops unknown keys (unit: hypothetical `salary` stripped); GET `select` excludes them in framework source — runtime check pending deployment |
| Dashboard: personalized, permission-aware widgets (BRD §4.1B–D) | ✅ | `ess-dashboard.spec.ts` (3 tests): real summary for mobile session, sign-in prompt for local accounts, shortcuts gated; registry unit tests (`widgets.test.ts`) |
| No fabricated data (BRD §4.1B) | ✅ | `coming` services never link; announcements/pending-actions are typed `placeholder` widgets with honest badges — asserted in `widgets.test.ts` |
| Offline rule: no persistent profile cache (BRD §4.4) | ✅ | Profile lives in hook memory only; e2e #5: backend unreachable → error + Retry, session kept, no forced logout |
| Profile cached in SW / confidential data in caches | ✅ | `public/sw.js:40` skips all cross-origin requests — API/auth never intercepted; app shell caching only (Phase 1 PWA evidence) |
| Session survives reload (regression guard) | ✅ | §5 fix; `mobile-login.spec.ts` reload test + `ess-profile.spec.ts` full-reload flows |

### Verification commands (all green at handover)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| `npm run test:run` | **35 files / 264 tests pass** (incl. 34 ESS tests: `ess-client` 10, `widgets` 6, `profile-mapping` 7, `ess-device` 8, `pwa-manifest` 3) |
| `NODE_ENV=production npm run build` | pass (static export) |
| `npx playwright test` | **22 tests pass** (13 pre-existing + 6 `ess-profile` + 3 `ess-dashboard`) |

## 7. Open items / Phase 3 handover

1. **Backend implementation** of `docs/ESS-API-CONTRACT.md` — especially
   `PATCH /employees/me` and the security test matrix (contract §4,
   release-blocking). Then re-run `ess-profile.spec.ts` against a real
   framework deployment to promote the ⏳ items to ✅.
2. Android verification (back button, install) remains **environment-blocked**:
   `ANDROID_HOME=D:\Android\Sdk` does not exist (same blocker as Phase 1 §7).
3. Phase 3 scope (per BRD): attendance status summary, schedule and
   leave-balance summaries — each needs its backend endpoint added to the
   contract first.
4. Server-driven widget configuration (contract §3 appendix) when admin
   customization is required.
