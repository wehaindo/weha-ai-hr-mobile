# Features

What the WEHA Device Framework ships out of the box. One codebase runs as **web/PWA** (static export, sql.js + IndexedDB), **Electron** (desktop, SQLite file) and **Capacitor** (Android/iOS). This page is the map — see the linked docs for setup detail.

Everything here is **opt-in per build target** via module flags in `device.config.ts`, so a phone build stays lean while a desktop/tablet build gets the full set.

## Build targets & feature profiles

Chosen at build time by `NEXT_PUBLIC_APP_TARGET` (see `src/lib/app-target.ts`); each build script pins it.

| Target | Profile | Command |
|---|---|---|
| `web` (PWA) | minimal | `npm run dev` / `npm run build` |
| `electron` | **full** | `npm run electron:dev` / `electron:build` |
| `cap-tablet` | **full** | `npm run cap:sync` |
| `cap-mobile` (phone) | minimal | `npm run cap:sync:mobile` |

Full = everything below. Minimal = sync + data hub + auth + security + retention + push + 3D only. Details: [ARCHITECTURE.md](ARCHITECTURE.md#build-targets-feature-profiles).

## Platform architecture

- **DeviceBridge** (`src/platform/`) — the single platform seam. App code never touches `window.electronAPI`, IndexedDB or Node APIs; every capability (`db`, `kv`, `print`, `hardware`, `realtime`, `cloud`, `push`, `location`, …) is implemented per target behind one interface.
- **Offline-first SQLite** — sql.js in the renderer (web/Capacitor → IndexedDB persistence) or the main process (Electron → `userData/device.db`). Schema is applied by **numbered migrations**, never ad-hoc DDL.
- **No server, no API routes** — `next build` produces a static `out/`. Electron serves it via `app://`; Capacitor ships it as the web bundle.
- **Sync outbox** — mutations you want synced go through `enqueueSync()` and drain when the backend is reachable; local write first, sync second.

## Authentication & security

| Feature | Notes |
|---|---|
| PIN login | Seeded admin (PIN **1234**) + per-user PINs; bcrypt-hashed, lockout after N attempts. |
| Username + password | Optional second factor per user (`admin`/`admin123` seeded). [MOBILE-AUTH.md](MOBILE-AUTH.md) |
| WEHA-account login | Password + email OTP against weha-framework `/api/mobile/v1/auth/*`, session tokens refreshed on boot. |
| Roles & permissions | DB-backed role → permission registry; `<RequirePermission>` route guards; permission-filtered sidebar. |
| Security policy | Max attempts, lockout window, PIN length — Settings → Security (full profile). |

## Shell, navigation & theming

- **Sidebar** on wide screens (desktop/tablet); **bottom navigator** on phones and narrow web viewports (responsive; header collapses into a Profile sheet).
- **Module + permission gating** — nav items and routes hide automatically when a target lacks the module or the role lacks the permission.
- **Themes** — light/dark + named presets (Settings → Appearance), `next-themes`, brand color from `device.config.ts`.
- **Device profiles** — phone/tablet/desktop detection drives layout (e.g. on-screen keyboard toggle, display toggles).
- **Customer-facing displays** — `bridge.display.open()` renders a route on a second fullscreen window (Electron) or a new tab (web).

## Sync & integrations

| Feature | Module flag | What it does |
|---|---|---|
| **ERP sync** | `sync` | Device activation → device token; outbox drain to `/api/device/{configCode}`; per-entity incremental pull/push (15s default). Settings → Sync. |
| **Data Hub replication** | `datahub` | Enrollment-key registration → bidirectional replication with ai-datahub (`/api/v1/sync/*`), reject handling. [See Settings → Data Hub] |
| **Cloud sync** | `cloud` | Three destinations via a job-table worker (retry/backoff): **Supabase**, **Google Sheets**, **Grist** — each with config + column maps. Settings → Cloud Sync. |
| **Realtime channel** | `realtime` | WebSocket register/heartbeat/event/remote-command with offline queue + reconnect. Settings → Realtime. |
| **AI Realtime** | `aiRealtime` | Socket.IO gateway; publishes `device.active`/`device.heartbeat`/session events. [AI-REALTIME.md](AI-REALTIME.md) |
| **Integrations registry** | `integration` | Register per-entity sync definitions + field maps. Settings → Integrations. |

## Push notifications (FCM)

Acquires an FCM token on **web/PWA** (Firebase SDK + generated service worker) and **Capacitor** (`@capacitor/push-notifications`); Electron has no Push API and falls back to local notifications. The token is registered with the backend (`POST /api/device/fcm-token`). Opt-in per device via Settings → Push. **[FCM.md](FCM.md)**

## Device capabilities

### Printing
- **Receipts & labels** — template engine with a visual **designer** (drag elements, barcode/QR/code128/ean13), receipt renderer, and **ZPL** generation for label printers. Settings → Templates / Receipt.
- **Print pipeline** — job queue over the bridge (`print:raw`), network printer targets (TCP 9100), Electron raw printing.

### Hardware
- **Serial / USB / network** — `hardware.serial`, `hardware.exchange` (request/response, ETX-delimited), `hardware.discover`, `hardware.test` (Electron-only; web/Capacitor degrade gracefully).
- **Cash drawer** — ESC/POS pulse over a network printer target.
- **On-screen keyboard** — touch keyboard overlay on tablet/kiosk builds.
- Settings → Hardware for device management + tests.

### Payment terminals (ECR/EDC)
Generic STX/ETX/LRC framing for Indonesian bank terminals (BCA, Mandiri, Niaga): sale, void, refund, settlement packets over serial/TCP. Module `ecr` (full profile).

### Device capture (QR / camera / GPS)
- **QR + camera** — reusable `<QrScanner>` + `qr-session` (native `BarcodeDetector`, `jsQR` fallback); camera always released on unmount.
- **GPS** — `bridge.location` capability (`permission`/`requestPermission`/`getCurrent` → `GeoFix`).
- Sample page: **`/scan-locate`**. **[DEVICE-CAPTURE.md](DEVICE-CAPTURE.md)**

### 3D (three.js)
`@react-three/fiber` + drei, lazy-loaded so it never bloats the startup bundle. Module `three` (all targets). Sample page: **`/attendance`** — an animated figure reacting to check-in/out + a multi-phase punch flow (send → server processing → result).

## AI voice
Whisper-compatible STT transcription + LLM order parsing with a product-alias map (spoken name → target). Entity-agnostic — a device app maps parsed items to its own catalog. Module `aiVoice` (full). Settings → Ai Voice.

## Sample / reference pages
Copyable starting points for device apps (framework-owned, `sample_`-prefixed tables):

| Route | Demonstrates |
|---|---|
| `/dashboard` | App overview + device status |
| `/transactions` | Atomic header+lines save (`bridge.db.batch`), money in minor units, permission gating |
| `/sync` | ERP activation, outbox stats, sync log, manual run |
| `/scan-locate` | QR/camera scan + GPS capture primitives |
| `/attendance` | three.js 3D scene + multi-phase server round-trip |
| `/settings/testing/*` | Test fixtures for integration/sync validation |

## Settings surface
General · Layout · Users · Security · Hardware · Templates · Receipt · Integrations · Data Hub · Testing · Cloud Sync · Ai Voice · Realtime · Push (FCM) · Backup · Data Retention · Appearance · About — each gated by its module flag (see `src/app/settings/layout.tsx`).

- **Backup / restore / clear** — full-profile export + import of the SQLite database (Settings → Backup).
- **Data retention** — automated pruning by age with audit log (Settings → Data Retention).
- **Testing fixtures** — `test_products` / `test_orders` / `test_order_lines` / `test_lookups` for exercising integration + sync end-to-end (Settings → Testing).

## Testing & quality
- **Vitest** unit tests in `__tests__/` (jsdom / node per suite), **Playwright** e2e in `tests/e2e/`.
- The web bridge runs real sql.js against mocked storage — tests exercise real SQL.
- Run before finishing: `npx tsc --noEmit`, `npm run lint`, `npm run test:run`.

## Feature matrix by target

| Feature | web | electron | cap-tablet | cap-mobile |
|---|:-:|:-:|:-:|:-:|
| Offline DB, sync, auth, security, retention | ✅ | ✅ | ✅ | ✅ |
| Data Hub, push (FCM), 3D (lazy) | ✅ | ✅ | ✅ | ✅ |
| Print, hardware, ECR, cloud sync | — | ✅ | ✅ | — |
| Realtime, AI Realtime, AI voice, testing, backup | — | ✅ | ✅ | — |
| Google / Grist / Supabase cloud | — | ✅ | ✅ | — |
| QR scan + GPS (web APIs) | ✅ | ✅ | ✅ | ✅ |
| Bottom navigator (replaces sidebar) | narrow only | — | — | ✅ |

*(— = module flag off for that build.)*

## Docs
- [ARCHITECTURE.md](ARCHITECTURE.md) — bridge, database, sync, auth, theming
- [CREATING-A-DEVICE-APP.md](CREATING-A-DEVICE-APP.md) — step-by-step extension guide
- [MOBILE-AUTH.md](MOBILE-AUTH.md) — WEHA-account login (password/OTP)
- [AI-REALTIME.md](AI-REALTIME.md) — Socket.IO gateway integration
- [FCM.md](FCM.md) — push notifications setup
- [DEVICE-CAPTURE.md](DEVICE-CAPTURE.md) — QR/camera + GPS
