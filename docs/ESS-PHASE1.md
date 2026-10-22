# ESS Phase 1 — Framework Assessment & Deployment Decision

This document records the Work Package 1 assessment of
[weha-device-framework](https://github.com/wehaindo/weha-device-framework)
for the WEHA Employee Self-Service (ESS) application, the Phase 1 deployment
decision, and the handover notes for Phase 2. All findings are evidence-based
(file paths refer to this repository unless noted).

## 1. Summary

`weha-ai-hrd-mobile` is a copy of the `weha-device-framework` template. Phase 1
was executed as **delta work on this repository** rather than a greenfield
bootstrap: the framework already provides the application shell, offline
SQLite, route/permission gating, API clients, Capacitor configuration, the
`DeviceBridge` platform seam, and — since the upstream merge of `911ca7b` —
**WEHA-account mobile login (password + email OTP)** via weha-framework's
`/api/mobile/v1/auth/*` endpoints (`docs/MOBILE-AUTH.md`).

The genuinely new Phase 1 work was: the PWA layer (manifest, icons, service
worker), the Android project generation, the ESS navigation/placeholder
screens, the ESS employee-context contract, the device capability facade and
diagnostics screen, and CI.

## 2. Deployment decision — Option B (static web bundle)

**Selected: Option B.** The application is a pure client (`next.config.ts` →
`output: 'export'` → `out/`): no API routes, no server actions, no Next
middleware (see `AGENTS.md` and `docs/ARCHITECTURE.md`). The same static
bundle is served by browsers (PWA) and packaged by Capacitor for Android
(`webDir: 'out'`).

Consequences and limitations:

- All backend calls are made from the client via `bridge.cloud.request`
  (browser `fetch` on web, Electron IPC elsewhere) against
  `NEXT_PUBLIC_ERP_BASE_URL` (weha-framework). CORS is open on the framework
  mobile routes.
- Authentication tokens live in local SQLite (`mobile_auth_sessions`);
  identity lives in the persisted zustand session (`device-auth`). Tokens are
  never in `localStorage` and no secrets are compiled into the bundle —
  `NEXT_PUBLIC_*` holds only public configuration.
- The service worker caches static application assets only. ERP/mobile-auth
  endpoints are cross-origin and are therefore never intercepted or cached by
  the service worker.
- Session expiry handling is client-driven (`ensureFreshAccessToken` refresh
  with a 5-minute skew); the backend still authorizes every protected request.

## 3. Capability matrix

| Capability | Status | Evidence |
|---|---|---|
| Browser/PWA | Verified (web runtime) / PWA layer added in Phase 1 | Web bridge = sql.js WASM + IndexedDB storage; `public/manifest.json`, `public/sw.js` |
| Android | Partially verified | `capacitor.config.ts` (appId from `device.config.ts`, `webDir: 'out'`); runtime detection via `window.Capacitor.isNativePlatform()` (`src/platform/index.tsx`); `android/` generated locally (gitignored) |
| Camera / QR | Not supported (gap) | No `DeviceBridge` camera method, no `@capacitor/camera` plugin |
| RFID | Not supported (web/Android) | `bridge.hardware.serial` is Electron-only and throws on web/Capacitor |
| Fingerprint | Not supported (gap) | No biometric SDK integration |
| Location | Not supported (gap) | No bridge method / plugin — needed by attendance in Phase 2/3 |
| Notifications | Partially verified | `bridge.notify` uses the Web Notification API (works in PWA); Android needs a Local Notifications plugin |
| Device identity | Verified | `bridge.appInfo()`, `device.name` (kv), identity in `device.config.ts` |
| Lifecycle | Verified | `AppRuntime`/`providers.tsx` boot, `bridge.events.on`, adapter `dispose()` cleanup, PIN lockout |
| Offline behavior | Verified (strong) | Local SQLite + sync outbox + debounced atomic writes; mobile session is offline-tolerant (only a revoked refresh token logs out) |
| Build & testing | Verified | `npm run typecheck` / `lint` / `test:run` / `test:e2e` / `build`; CI workflow added |

Gaps with a resolution plan: camera/QR, location and biometric support require
new `DeviceBridge` methods plus Capacitor plugins — scheduled for the phases
that need them (attendance), not Phase 1.

## 4. Authentication (WEHA-account mobile login)

The device offers three login modes (login screen at `/`, `docs/MOBILE-AUTH.md`):

| Mode | Validation | Network |
|---|---|---|
| PIN | local SQLite (`users.pin_hash`) | no |
| Username & password | local SQLite (`users.password_hash`) | no |
| **WEHA account (password / email OTP)** | weha-framework `/api/mobile/v1/auth/*` | yes, at sign-in |

The WEHA-account mode is the ESS entry point: a portal user (usually linked to
an Employee) signs in with their email; no local device account is needed.

- Token pair (15-min access JWT + 30-day rotating refresh) stored in SQLite
  `mobile_auth_sessions` (migration `0024_mobile_auth`).
- Identity in the zustand `device-auth` session with `authSource: 'mobile'`,
  carrying `employeeId`, `portalUserId`, `email`, `name`, `tenantSlug`
  (`src/integration/mobile-auth/client.ts` → `MobileIdentity`).
- Boot-time refresh with 5-minute skew (`src/auth/mobile-session.ts`); a
  revoked refresh token (401/403) is the only client-side logout trigger —
  an unreachable framework keeps the session.
- Tenant selection: Settings → Security → *Mobile login* (`device_settings`
  key `auth.mobileTenantSlug`); empty = single-tenant default.
- Backend configuration: `NEXT_PUBLIC_ERP_BASE_URL` on the device,
  `MOBILE_ACCESS_SECRET` on weha-framework.

Known limitation vs the ESS requirement of "roles and permissions from trusted
backend services": mobile sessions currently receive a fixed operator
permission set (`app.use`, `transactions.use`). The backend remains the
authority for every protected request; richer client-side role display is
pending a real identity/profile endpoint.

## 5. Employee context contract

`src/lib/ess/employee-context.ts` builds `EssEmployeeContext` from the
mobile-auth identity plus the local session:

- `employeeId`, `displayName`, `tenantSlug` come from the verified backend
  identity; `roles`/`permissions` from the local session.
- Profile enrichment (`employeeCode`, `departmentId`) is a typed, mocked stub
  marked *pending integration* — the backend endpoint is not yet confirmed.
  Mock data is clearly separated from backend data and must not be counted as
  production integration.

## 6. Device capability facade

`src/lib/platform/ess-device.ts` implements the ESS-facing
`EssDeviceAdapter` contract (`getPlatform`, `getCapabilities`,
`getDeviceInfo`, `initialize`, `dispose`) as a thin facade over the existing
`DeviceBridge` (`useBridge()`). Capabilities are detected at runtime, so a
missing capability (camera, location, …) never breaks the dashboard; errors
are normalized to `EssDeviceError` with documented codes. A mock adapter for
development/tests is built on `__tests__/helpers/fake-bridge.ts`.
`src/app/diagnostics/page.tsx` displays the live results (runtime, adapter
status, capabilities, module switches, safe error messages).

## 7. Acceptance evidence

Recorded during Phase 1 completion:

- `npx tsc --noEmit` — pass · `npm run lint` — pass
  (one override added: `require()` allowed in `scripts/**/*.js` CJS scripts).
- `npm run test:run` — **33 files / 245 tests pass**, including
  `__tests__/auth/mobile-auth.test.ts` and the new `__tests__/ess/*` suites
  (adapter, employee context, manifest).
- `NODE_ENV=production npm run build` — 28 static pages exported; PWA assets
  (`manifest.json`, `sw.js`, `icons/`) present in `out/`.
  **Note:** this machine exports `NODE_ENV=development` globally — plain
  `npm run build` fails with a React `useContext` prerender error; always build
  with `NODE_ENV=production` (CI does).
- `npx playwright test` — **13 e2e tests pass** (login, settings,
  mobile-login; the mobile-login spec mocks weha-framework — not counted as
  production integration proof).
- PWA runtime check against the static build (Playwright/Chromium):
  manifest linked (`/manifest.json`), **service worker active and controlling
  the page**, icons return 200, `theme-color` meta present, and offline
  navigation falls back to the cached app shell. Install prompt itself is
  Chrome UI — verify with a manual "Install app" check when convenient.
- Android: `npx cap add android` + `npx cap sync` succeed (web assets copied
  into `android/`). **Gradle build blocked by the environment**: `ANDROID_HOME`
  points to `D:\Android\Sdk`, which does not exist (no platforms, build-tools
  or licenses). Per BRD §4.4 this is a documented blocker — install the Android
  SDK (or Android Studio) and run `android\gradlew.bat assembleDebug` to
  complete the Android acceptance item.

## 8. Open items / Phase 2 handover

1. Real employee-profile/roles backend endpoint — confirm with the backend
   team, then replace the enrichment mock in `src/lib/ess/employee-context.ts`.
2. Camera/QR, location, and biometric support — new `DeviceBridge` methods +
   Capacitor plugins when attendance lands (Phase 2/3).
3. Android notifications — Local Notifications plugin behind `bridge.notify`.
4. App identity — `device.config.ts` still carries the framework default
   (`appName`, `appId`); set the final ESS identity there before a Play
   release, since the app id is baked into `android/`.
5. Phase 2 scope (per BRD): employee profile display, personalized dashboard,
   attendance status summary, schedule and leave-balance summaries — consuming
   real backend data where available.
