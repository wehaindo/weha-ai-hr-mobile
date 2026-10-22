# ESS Phase 3 — Device-Based Attendance

Records the Phase 3 delivery of the WEHA ESS application: GPS and QR
attendance capture, geofence validation, an offline event queue with
idempotent submission, and the confirmation/sync surfaces. File paths refer
to this repository; the backend interface is `docs/ESS-ATTENDANCE-CONTRACT.md`
(backend team implements it separately — `weha-framework` was not modified).
BRD: "Phase 3: Device-Based Attendance" v1.0 (cited as §N).

## 1. Summary

Phase 3 ships the client half of the attendance BRD against a written
contract, following the Phase 2 pattern: mocked-API tests are evidence of
client behavior only — **server-side acceptance items remain pending the
backend build** (BRD §11: mocks are never production proof).

Delivered methods: **GPS** (geofence + accuracy validation) and **QR**
(worksite credential scan with a bundled decoder). **Fingerprint and RFID
are deferred** (confirmed scope decision): the framework exposes only raw
Electron serial write/ETX-exchange and no attendance hardware is verified —
BRD §11 limits integration to "verified supported interfaces". The method
types, capability names and backend contract carry `FINGERPRINT`/`RFID` so a
future terminal adapter slots in without rework.

## 2. What was implemented

| Deliverable | Files | Notes |
|---|---|---|
| Attendance API contract (backend deliverable) | `docs/ESS-ATTENDANCE-CONTRACT.md` | Proposed Prisma (`AttendanceWorksite`/`AttendancePolicy`/`AttendanceEvent` w/ `@@unique([tenantId, idempotencyKey])`), 7 endpoints under `/api/mobile/v1/attendance/*`, server-authoritative `attendanceType`, DUPLICATE replay semantics, `WEHAATT:` signed QR payloads, release-blocking security matrix |
| `location` bridge capability (framework-generic) | `src/platform/bridge.ts`, `src/platform/renderer-location.ts`, `src/platform/renderer-bridge.ts`, `electron/preload.ts` | `permission()/requestPermission()/getCurrent()`; error codes `permission_denied`/`timeout`/`unavailable`/`unsupported`; browser geolocation (identical on all renderer platforms; preload mirrors inline — no IPC needed) |
| Offline attendance queue | `src/db/migrations/0026_attendance_queue.ts`, `src/lib/ess/attendance/queue.ts`, `src/lib/offline/backoff.ts` | `attendance_queue` (immutable `payload` evidence, `idempotency_key` UNIQUE, status queued/submitting/accepted/rejected/failed, attempt cap 8); local rejections preserved, never submitted; shared exponential backoff; retention registered at 180 days |
| Attendance API client | `src/integration/ess/core.ts`, `src/integration/ess/attendance.ts` | ESS request pipeline extracted to `core.ts` (auth, envelope, one forced refresh-retry, `Idempotency-Key` header, `rate_limited`/`not_found` codes) shared by profile + attendance; `EssAttendanceApi` with zod `.strip()` + Decimal coercion; never sends an employee id/`status`/`attendanceType` |
| Domain logic | `src/lib/ess/attendance/{geofence,payload,qr}.ts` | Haversine + policy verdicts (`allow`/`reject`/`exception`/`retry_accuracy` — accuracy checked first); allowlisted submission builder (key == event id, 16-hex); `WEHAATT:` payload guard |
| QR capture | `src/lib/ess/attendance/qr-session.ts` (+ `jsqr` dep) | getUserMedia rear camera → native `BarcodeDetector` when available, jsQR fallback (iOS/Safari); `stop()` releases all tracks (FR-04) |
| Sync drain | `src/lib/ess/attendance/sync.ts` | 1 due row → single POST; batch → `/events/sync`; classification: session expiry & network & 429 stop the drain without burning attempts, 4xx parks as failed, backoff gates retries |
| Attendance controller | `src/hooks/useAttendance.ts` | Capability × policy matrix, GPS punch flow (locate → evaluate → enqueue → drain → confirmation), QR session management, drain triggers (mount, after punch, `online` with backoff reset, 30 s while pending), offline-tolerant refresh (local pending state updates even when the server fetch fails) |
| UI | `src/app/attendance/page.tsx`, `src/components/ess/attendance/*` | Status card (current state + FR-05 readiness chips + sync-pending), punch card (method picker with reasons, GPS strip, errors), QR panel, FR-07 confirmation (Recorded/Pending/Rejected/Already recorded — server values only), today's punches (server + local merge), pending-events card with manual retry |
| Capability detection | `src/lib/platform/ess-device.ts`, `src/app/diagnostics/page.tsx` | `location`/`camera`/`qr-scan` now detected at runtime; RFID/fingerprint honestly absent; diagnostics grid updates automatically |

Tests: **73 new unit tests** (`renderer-location` 7, `attendance-queue` 11,
`attendance-client` 11, `geofence` 8, `payload` 7, `qr` 6, `qr-session` 5,
`attendance-sync` 12, ess-device detection +2, plus updated migrate table
assertion) and **8 e2e** (`tests/e2e/ess-attendance.spec.ts` with deterministic
`context.setGeolocation()` and a CORS-aware mock in
`tests/e2e/helpers/attendance-mock.ts`): renders, local-account no-session with
zero API calls, GPS happy path (payload allowlist + idempotency == event id),
out-of-geofence → local rejection with **zero submissions**, DUPLICATE →
"Already recorded", offline → pending → drained on reconnect, session expiry →
reauth, camera-unavailable guidance.

## 3. Framework fixes shipped (beyond the attendance UI)

Two real durability bugs surfaced by the new full-reload e2e flows — both
fixed in framework files (generic, benefit every device app):

1. **One renderer bridge per page generation** — `src/platform/index.tsx`
   `getBridge()` now caches its creation promise. Previously every
   `BridgeProvider` mount created a **new sql.js engine on the same IndexedDB
   blob** (StrictMode/HMR/remounts); two engines race last-writer-wins and one
   can overwrite the other's persisted state (observed as an intermittently
   missing `mobile_auth_sessions` row after login → "No employee session").
2. **IndexedDB writes are awaited to commit** — `IndexedDbBlobStore.save()`
   (`src/db/persistence.ts`) now awaits the transaction's `oncomplete`, not
   just the `put` request success; a navigation between the two aborted the
   pending commit and silently lost the write. (The `pagehide` best-effort
   flush in the engine remains as a backstop.)

Together these made every login→reload flow deterministic (loop diagnostic:
6/6 clean; `ess-attendance` 8/8 across 3 consecutive runs; full e2e 30/30).

## 4. Adaptations vs the BRD

- **Paths**: BRD §6 `/ess/attendance/*` → the Phase 1/2 convention
  `/api/mobile/v1/attendance/*` (contract §3).
- **Admin device surface** (BRD `GET /ess/attendance/devices`, heartbeat):
  out of the ESS client's scope — device registration/heartbeat lives in the
  framework's tenant admin (`/api/device/*`, `Device.lastHeartbeat`). Client
  FR-05 "device status" = local capability detection + queue state.
- **Camera not via the bridge**: `MediaStream`/`HTMLVideoElement` cannot cross
  Electron's `contextBridge`, and `getUserMedia` is the same web API on all
  renderer platforms (precedent: `ess-device.ts` probes renderer globals) —
  the scanner is an app-side service with the seam kept at the capability
  probe.
- **Geofence thresholds**: the worksite's `maxAccuracyMeters` wins over the
  company default (site-specific beats general); the server recomputes
  distance regardless (contract §2.6) — client verdicts only gate UX.
- **Drain batching**: the contract's `/events/sync` batch endpoint is used
  when more than one event is due; a single event uses the single endpoint.
- **Permission**: no new `attendance.*` key — attendance stays under `ess.use`.
- **Client never decides check-in vs check-out**: BRD FR-02 assigns that to
  the server (state + policy); the client only renders `expectedNext` and the
  server-resolved type.

## 5. Acceptance evidence (BRD §9)

Status: ✅ delivered & verified here · ✅/⏳ client done, **real integration
pending backend** · ⏳ pending backend (release-blocking) · ⛔ env-blocked.
Mocks are explicitly not production proof (BRD §11).

| Item | Status | Evidence |
|---|---|---|
| Check in/out with each configured supported method | ✅/⏳ | GPS: e2e punch happy path + payload assertions; QR: `qr-session` unit tests (decode, cleanup), camera-failure path e2e; backend `POST /attendance/events` pending |
| GPS validates worksite boundaries and accuracy | ✅/⏳ | `geofence.test.ts` (boundary/threshold/policy verdicts), e2e out-of-geofence with zero submissions; server-side recompute pending (contract §2.6) |
| Unsupported capabilities identified without crashing | ✅ | Runtime capability matrix (`ess-device.ts`), diagnostics page, e2e local-account + camera-unavailable cases |
| Permission denial handled | ✅ | Location denied → guidance + alternate method (hook + unit); camera denied → `permission_denied` guidance (`qr-session.test.ts`) |
| Device disconnection handled | ✅ (n/a client) | Phase 3 has no external readers; QR/camera failures surface as retryable states (e2e) |
| Repeated callbacks/retries create no duplicates | ✅/⏳ | Client: `UNIQUE(idempotency_key)` + drain replay-safe recovery + e2e DUPLICATE result; **server uniqueness is release-blocking** (contract §5 row 6) |
| Legitimate check-out never suppressed as duplicate | ⏳ | Server rule (contract §2.5 — interval applies to the same `attendanceType` only); the client never suppresses (server resolves the type) |
| Employee receives the authoritative result of each event | ✅ | FR-07 confirmation card renders only server values (`recordedAt`/`status`); pending clearly labelled as device-captured (e2e) |
| Offline events sync safely, retaining capture evidence | ✅/⏳ | Immutable `payload` + drain with backoff + e2e offline→reconnect scenario; server late-sync policy pending (`stale_capture`, contract §2.3) |
| Policies cannot be bypassed by changing client values | ⏳ | Release-blocking server matrix (contract §5 rows 3–5, 11): geofence recomputed, `status`/`attendanceType` rejected |
| Employees cannot access others' attendance | ⏳ | Server scoping from the token employee (contract §3.7/§5 row 10); client never sends or queries another employee id |
| History + administrative audit available to authorized users | ✅/⏳ | History client (`getEvents`, employee-scoped) implemented; audit rows are server-side (contract §2.10) |
| PWA + Android device-combination tests | ✅/⛔ | PWA verified on Chromium (30/30 e2e); **Android SDK-blocked** (`ANDROID_HOME` missing) — Capacitor plugin swap (`@capacitor/geolocation`/`camera`) documented as release work |

## 6. Verification (all green at handover)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| `npm run test:run` | **43 files / 332 tests pass** |
| `NODE_ENV=production npm run build` | pass — 33 static pages exported |
| `npx playwright test` | **30 tests pass** (22 pre-existing + 8 attendance) |

## 7. Open items / next phase

1. **Backend build** of `docs/ESS-ATTENDANCE-CONTRACT.md` (models, 7 routes,
   idempotency store, QR signer, rate limiting, the §5 security matrix as
   automated tests) — then re-run `ess-attendance.spec.ts` against a real
   deployment and promote the ⏳ items.
2. **Android release work** (SDK-blocked): `@capacitor/geolocation` +
   `@capacitor/camera` behind the existing seam, Gradle build, on-device GPS
   and QR verification, back-button flow.
3. **Fingerprint/RFID** when verified hardware exists: a terminal adapter
   behind the attendance service (Electron `hardware.exchange` is the
   candidate transport); the contract already reserves the method enum and
   `AttendanceCredential`.
4. Optional: server-driven widget config (attendance status on the dashboard)
   — only if an extra dashboard API call becomes acceptable.
