# Business Requirements Document (BRD) — WEHA Device Framework

| | |
|---|---|
| **Document** | Business Requirements Document |
| **Product** | WEHA Device Framework (`weha-device-framework`) |
| **Version** | 1.0 |
| **Date** | 2026-11-12 |
| **Status** | Draft — for review |
| **Owner** | WEHA engineering |
| **Related** | [README](../README.md) · [ARCHITECTURE](ARCHITECTURE.md) · [FEATURES](FEATURES.md) · [PLATFORM-SUPPORT](PLATFORM-SUPPORT.md) |

---

## 1. Executive summary

The WEHA Device Framework is a reusable, offline-first foundation for building
**device applications** — POS terminals, kiosks, warehouse scanners, attendance
devices — that must run reliably on retail-floor hardware with intermittent
connectivity and integrate with the WEHA ERP backend.

One codebase ships as three runtimes (static **Web/PWA**, **Electron** desktop,
**Capacitor** Android) over a single platform seam (DeviceBridge), an offline
SQLite database with numbered migrations, three sign-in methods with role-based
permissions, and a synchronization layer that keeps local data converging with the
ERP and the Data Hub whenever the network is available.

New device apps are produced by **copying the template and changing its identity**
(`npm run init-app`) plus domain-specific routes — not by rewriting infrastructure.
The framework was derived from the production-hardened `ai-pos` codebase with all
POS domain logic removed.

## 2. Business context & problem statement

**Problems today:**

1. **Duplicated effort** — every new device type historically re-implements
   offline storage, authentication, sync, theming and hardware glue.
2. **Connectivity** — retail and warehouse sites frequently have no or unstable
   internet; cloud-only apps fail at the counter.
3. **Device diversity** — the same product line must run in a browser, on a
   Windows terminal with receipt printers and cash drawers, and on Android
   phones/tablets.
4. **Identity sprawl** — staff sign in with PINs, local passwords, or corporate
   WEHA accounts depending on device class; permissions must be consistent.
5. **Data governance** — money, timestamps and identifiers must be stored
   consistently so ERP reconciliation and audits are possible.

**Opportunity:** a single hardened template turns a new device app from a
project into a configuration exercise, while keeping every app on the same
security, sync and data conventions.

## 3. Business objectives

| ID | Objective | Measure |
|---|---|---|
| **BO-1** | Ship a new device app fast | Scaffold + identity + first domain page within one working day |
| **BO-2** | Operate with zero connectivity | All core workflows (login, records, printing) work offline indefinitely |
| **BO-3** | One codebase, three runtimes | Web, Electron and Capacitor builds from the same source, green in CI |
| **BO-4** | Consistent, auditable access control | Every app ships the same 3 login methods, roles and lockout policy |
| **BO-5** | Trustworthy ERP/Data Hub integration | Device-scoped credentials; local-first writes; eventual convergence |
| **BO-6** | Cover real device hardware | Receipt printing, cash drawers, scanners, scales and payment terminals |
| **BO-7** | Governed data lifecycle | Backup/restore, retention with audit trail, deterministic migrations |

## 4. Scope

### 4.1 In scope (the framework)

- Application shell: navigation, routing gates, theming, responsive layout.
- Offline database: sql.js engine, migrations, repositories, backup, retention.
- Identity: PIN / password / mobile sign-in, roles, permissions, lockout.
- Synchronization: device activation, outbox, per-entity pull/push, Data Hub
  replication, cloud targets, realtime channels.
- Device capabilities: printing pipeline, hardware registry + tests, ECR payment
  transport, QR/camera capture, GPS, customer display, push notifications.
- Multi-platform delivery: four build targets, module profiles, packaging.
- Scaffolding (`init-app`), documentation suite, tests, agent skills.

### 4.2 Out of scope

- **POS / domain business logic** (sales, cart, inventory) — belongs to each
  device app built on the template.
- **Backend systems** — `weha-framework` (ERP, device/mobile APIs) and
  `ai-datahub` are separate products this framework consumes.
- **iOS shipping** — the Capacitor iOS project/APNs provisioning is not yet set
  up (Android is); tracked as future work.
- Payment authorization itself — ECR support is transport/framing only.
- MDM/device management and OS-level kiosk lockdown.

## 5. Stakeholders & user roles

| Stakeholder | Interest |
|---|---|
| **Business owner** | Fast delivery of device apps; operating cost; auditability |
| **IT / device operator** | Deployment, activation, remote configuration, backup |
| **Administrator** | Device setup, user management, security policy, integrations |
| **Manager** | Operational data, sync status, overrides |
| **Operator** | Daily sign-in and task execution on the device |
| **Developer** | Template extensibility, conventions, docs, test coverage |

In-app roles (permission-gated): **Administrator**, **Manager**, **Operator**
(employee free-text roles map onto these; unmapped → operator).

## 6. Business requirements

| ID | Requirement |
|---|---|
| **BR-01** | A new device app shall be produced from the template without modifying framework internals. |
| **BR-02** | The device shall remain fully usable (sign-in, data entry, printing) with no network connection. |
| **BR-03** | Local data shall converge with the ERP/Data Hub automatically when connectivity returns. |
| **BR-04** | Only authorized personnel shall access the device, via at least two independent credential types. |
| **BR-05** | Every permission change and destructive data operation shall be attributable (role model + audit/retention logs). |
| **BR-06** | The same product shall be deliverable as web, desktop and mobile builds. |
| **BR-07** | Money and time values shall be stored in unambiguous, ERP-reconcilable formats. |
| **BR-08** | Framework upgrades shall be adoptable without losing app-specific domain code. |

## 7. Functional requirements

### 7.1 Identity & access (FR-1)

| ID | Requirement |
|---|---|
| FR-1.1 | The login page shall offer **three methods**: PIN grid, username + password, and WEHA mobile account (password + email OTP), switchable when enabled. |
| FR-1.2 | Enabled methods shall be selectable at build time via `NEXT_PUBLIC_LOGIN_METHOD` (comma list or `all`; default = all three). |
| FR-1.3 | PIN sign-in shall list active local users **and** synced employees that have a device PIN (`employees.device_pin_hash`), verified offline with bcrypt. |
| FR-1.4 | Password sign-in shall verify against synced `portal_users` (case-insensitive email) first, falling back to local `users` credentials. |
| FR-1.5 | Mobile sign-in shall authenticate against the framework API (`/api/mobile/v1/auth/*`), persist the session, refresh tokens on boot, and require first-run tenant-slug setup. |
| FR-1.6 | Roles shall be DB-backed (`role_permissions`) with route/sidebar gating; admin (PIN **1234**) and demo users are seeded on first run. |
| FR-1.7 | Configurable lockout shall apply to failed sign-in attempts (max attempts, window — Settings → Security). |
| FR-1.8 | Authentication logic shall be registrable/extensible through the central **auth manager** (`registerAuthProvider`) for future credential types. |

### 7.2 Offline data management (FR-2)

| ID | Requirement |
|---|---|
| FR-2.1 | All application data shall live in a local SQLite database (sql.js): file-backed under Electron `userData`, IndexedDB-backed on web/Capacitor. |
| FR-2.2 | Schema changes shall be applied exclusively through numbered, idempotent migrations that run on every platform before boot. |
| FR-2.3 | Writes shall be local-first and immediate; sync shall never block the UI. |
| FR-2.4 | The full dataset shall be exportable/importable as portable JSON; on Electron, native `.db` file save/open dialogs shall also be available. |
| FR-2.5 | Retention shall prune aged rows by policy with an audit-log entry; purge operations shall be explicit and logged. |
| FR-2.6 | Platform access shall flow only through the DeviceBridge — app code shall never touch `window.electronAPI`, `indexedDB`, `fs` or Node APIs. |

### 7.3 Device activation & ERP synchronization (FR-3)

| ID | Requirement |
|---|---|
| FR-3.1 | The device shall activate against the ERP with an activation code/link, receiving a **device token + tenant** that persist across restarts. |
| FR-3.2 | The device-server URL shall be configurable at runtime (Sync page, kv override) with an env fallback; mobile auth intentionally remains env-configured. |
| FR-3.3 | Activation shall be clearable/re-activatable from the UI (token rotation handled server-side). |
| FR-3.4 | Outbound mutations shall be queued in an outbox and drained with retry/status tracking; sync failures shall be visible (sync log). |
| FR-3.5 | Per-entity incremental pull/push shall be configurable per integration (endpoint config code, field maps, schedule, page size, direction). |
| FR-3.6 | The device shall send periodic heartbeats and report sync/run status on the Sync page. |
| FR-3.7 | Manual **Sync now** shall bypass the schedule (force run) for operator-triggered convergence. |

### 7.4 Integrations & Data Hub (FR-4)

| ID | Requirement |
|---|---|
| FR-4.1 | Each entity shall declare its sync source: **`device`** (REST via device auth), **`datahub`** (event replication), or **`api_key`** (legacy arbitrary base URL). |
| FR-4.2 | The Integrations page shall register entities, edit field maps, show sync-source badges, and provide a **Records viewer** to inspect pulled data per integration. |
| FR-4.3 | Device-auth pulls shall call `GET /api/device/{configCode}` with bearer token + tenantId; Data Hub rows shall be owned by the hub pipeline (never double-driven). |
| FR-4.4 | The framework shall seed reference integrations idempotently at runtime (Products, Employees, Portal Users) — never via migrations. |
| FR-4.5 | Cloud sync targets (**Supabase, Google Sheets, Grist**) shall be configurable with column maps and job retry/backoff (full profile). |
| FR-4.6 | Realtime channels shall support register/heartbeat/events/remote commands with offline queue and reconnect (browser WebSocket or Electron main `ws`). |
| FR-4.7 | Enrollment-key registration with the Data Hub shall be supported as an alternative credential path. |

### 7.5 Device capabilities (FR-5)

| ID | Requirement |
|---|---|
| FR-5.1 | Receipts/labels shall be composed from templates (visual designer, barcodes: QR/Code128/EAN-13) and rendered to ESC/POS or ZPL. |
| FR-5.2 | The print pipeline shall queue jobs with status/retry and dispatch by target: raw TCP (port 9100), Windows driver queue (raw winspool), or serial. |
| FR-5.3 | A hardware registry shall manage devices (type, connection config, default) with **type-aware tests** (serial send/exchange, printer test, discovery) in Settings → Hardware. |
| FR-5.4 | Cash drawers shall open via ESC/POS pulse through a printer target. |
| FR-5.5 | Payment terminals (ECR/EDC) shall exchange STX/ETX-framed messages (sale, void, refund, settlement) over serial/TCP. |
| FR-5.6 | QR/camera scanning shall work through `BarcodeDetector` with jsQR fallback; the camera shall be released on unmount. |
| FR-5.7 | GPS capture shall expose permission + current fix through the bridge location capability. |
| FR-5.8 | A customer-facing display shall render a route on a second window (Electron) or new tab (web). |
| FR-5.9 | Push notifications shall acquire FCM tokens on web (Firebase SDK + service worker) and Capacitor (native plugin); Electron shall degrade to local notifications. |
| FR-5.10 | Kiosk builds shall offer an on-screen touch keyboard overlay (full profile). |

### 7.6 Administration & settings (FR-6)

| ID | Requirement |
|---|---|
| FR-6.1 | Settings shall expose General, Layout, Users, Security, Hardware, Templates/Receipt, Integrations, Testing, Cloud Sync, AI Voice, Realtime, Push, Backup, Retention, Appearance and About — each gated by its module flag. |
| FR-6.2 | Branding (name, id, port, brand color, login methods) shall be rewritable by `npm run init-app` without touching framework code. |
| FR-6.3 | Themes (light/dark + presets) and layout preferences shall persist per device. |
| FR-6.4 | Testing fixtures (`test_*` tables + seeded integrations) shall let integrations be exercised end-to-end without the production backend. |
| FR-6.5 | About shall display effective runtime configuration (target, server URL, version). |

### 7.7 Multi-platform delivery (FR-7)

| ID | Requirement |
|---|---|
| FR-7.1 | Four build targets shall be supported: `web`, `electron`, `cap-tablet`, `cap-mobile`, each pinning `NEXT_PUBLIC_APP_TARGET` at build time. |
| FR-7.2 | `electron`/`cap-tablet` shall receive the **full** module profile; `web`/`cap-mobile` the **minimal** profile (TypeScript-enforced completeness). |
| FR-7.3 | The web build shall be a pure static export (`out/`) deployable as a PWA; Electron shall serve it via `app://` (never hardcoded localhost); Capacitor shall ship it as the native web bundle. |
| FR-7.4 | Desktop packaging shall produce installers (NSIS/dmg/AppImage); Android shall build from the committed `android/` project. |
| FR-7.5 | Unsupported capabilities shall degrade explicitly (throw with guidance, sentinel values, or hidden UI) — never crash silently. |

### 7.8 Extensibility (FR-8)

| ID | Requirement |
|---|---|
| FR-8.1 | A new module (table + feature) shall be addable via: migration → module flag → nav/settings gating → page → repository → optional permission/integration seed → verification. |
| FR-8.2 | Platform capabilities shall be added by extending the DeviceBridge interface with both an Electron implementation and a web/Capacitor implementation. |
| FR-8.3 | The repository shall ship conventions (AGENTS.md), step-by-step guides, and agent skills (`create-device-module`, `login-methods`) so AI-assisted work follows the same rules. |

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| **NFR-1** | **Offline availability:** core workflows function 100% offline; sync is eventually consistent, never a precondition for use. |
| **NFR-2** | **Performance:** first paint from static assets; DB engine loads locally (WASM/native); heavy extras (3D) lazy-loaded; no network calls on the critical login path except mobile sign-in. |
| **NFR-3** | **Security:** bcrypt credential hashing; lockout policy; zero secrets in the client bundle (`device.config.ts` is public); bridge-only platform access; Electron context isolation with a minimal preload surface; no server attack surface (static app). |
| **NFR-4** | **Data integrity:** money = integer minor units; tax = basis points; booleans 0/1; timestamps ISO-8601 UTC; ids = 16-char hex; rows mapped by column name, never position. |
| **NFR-5** | **Portability:** no API routes, server actions or Next middleware; Electron main kept as a thin service host (no business logic, no per-entity IPC). |
| **NFR-6** | **Testability:** unit suite (Vitest, real sql.js against mocked storage) + Playwright e2e; `tsc`, lint and tests green before every finish. |
| **NFR-7** | **Compatibility:** Windows/macOS/Linux desktop; Android 10+ (JDK 21 toolchain); evergreen browsers; iOS planned. |
| **NFR-8** | **Maintainability:** numbered migrations never edited after apply; framework files stay domain-agnostic; documentation suite kept in step with code. |
| **NFR-9** | **Observability:** sync log, hardware log, audit log, integration run status and heartbeat visible in-app. |
| **NFR-10** | **Accessibility/usability:** keyboard-reachable UI, responsive layout (sidebar ↔ bottom nav), operator-grade flows (large PIN pad, minimal typing). |

## 9. External interfaces

| Interface | Direction | Notes |
|---|---|---|
| `weha-framework` device API | ↔ | Activation, `GET /api/device/{configCode}` pulls/pushes, heartbeat, FCM token registration |
| `weha-framework` mobile API | ↔ | `/api/mobile/v1/auth/*` password + OTP login |
| `ai-datahub` | ↔ | Enrollment-key registration, `/api/v1/sync/*` replication, reject handling |
| Firebase Cloud Messaging | → | Token acquisition (web/Capacitor), backend sends |
| Supabase / Google Sheets / Grist | → | Optional cloud sync targets (full profile) |
| Local hardware | ↔ | Serial/USB (serialport), TCP 9100, Windows print queues, camera, GPS |

## 10. Assumptions

1. `weha-framework` is available and owns device/mobile APIs; its seed scripts
   define the external-API config codes devices pull (e.g. `PRODUCT`,
   `EMPLOYEES`, `PORTAL_USERS`).
2. Device apps are **copies** of this repository (no monorepo dependency),
   upgraded by merging framework changes.
3. Connectivity is intermittent but eventually available for convergence.
4. A Firebase project exists if push is required (else the feature stays
   disabled without failing).
5. Operators can be trained on a single flow per device class; UI language
   remains as shipped (English strings today).

## 11. Constraints

1. The app is a **pure static client** — no server-side code may be introduced.
2. Framework files must remain domain-specific-free; POS-style logic belongs to
   device apps.
3. Secrets must never be committed or bundled into the client.
4. Applied migrations are immutable; schema evolves only by appending.
5. Phone and tablet builds are separate bundles — runtime must not depend on
   distinguishing them.

## 12. Dependencies

- **Internal:** `weha-framework`, `ai-datahub` (backend availability).
- **Toolchain:** Node 20+, TypeScript, Next.js 16 (static export), Electron 44,
  Capacitor 7 (Android SDK + JDK 21 for native builds).
- **Services:** Firebase (push, optional), network printers/payment terminals
  for hardware validation.

## 13. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Backend config-code/schema drift | Pulls fail or map wrong fields | Field maps editable per integration; Records viewer; seed scripts versioned with backend |
| App copies diverge from framework | Costly upgrades | Framework kept generic; docs + AGENTS conventions; merge-friendly file layout |
| Token revocation / server URL change | Sync outage | Runtime server-URL setting, clear-and-reactivate flow, visible sync errors |
| Capacitor plugin misconfiguration (e.g. missing `google-services.json`) | Push silently disabled | Build logs warn; PLATFORM-SUPPORT doc checklist; `cap sync` in build scripts |
| Hostile `NODE_ENV`/env leakage breaks builds | Build failure | Build scripts pin `NODE_ENV=production` via cross-env |
| Hardware variance (printers, terminals) | Field failures | Hardware registry with per-type tests; raw Windows printing verified against real devices |
| Credential store confusion (portal vs local) | Lockout complaints | Documented portal-first rules; additive identity sync avoids lockouts |

## 14. Success criteria

- New device app scaffolded and demonstrating a domain page within one day.
- Device stays fully usable for ≥ 72 h with no network; sync converges after
  reconnect with no data loss or duplicates (natural-key upserts).
- All four build targets produce green builds; unit + e2e suites pass.
- An operator can sign in via any enabled method and complete their primary
  task without assistance.
- Framework changes never require editing applied migrations or adding server
  code.

## 15. Glossary

| Term | Meaning |
|---|---|
| **Device app** | A product built by copying this template (POS, kiosk, scanner…) |
| **DeviceBridge** | The single platform seam every capability passes through |
| **Module** | A feature area gated by a `device.config.ts` flag |
| **Profile** | Full (electron/cap-tablet) or minimal (web/cap-mobile) module set |
| **Activation** | Exchanging an activation code for a device token + tenant |
| **Outbox** | Local queue of mutations awaiting ERP delivery |
| **Data Hub** | `ai-datahub` replication path (vs direct device REST) |
| **ECR/EDC** | Payment terminal message protocol (STX/ETX framing) |
| **ESC/POS** | Receipt-printer command language |
| **Tenant** | The WEHA organisation a device belongs to |

## 16. References

- [README](../README.md) — quick start and build commands
- [ARCHITECTURE](ARCHITECTURE.md) — bridge, database, sync, auth, theming
- [FEATURES](FEATURES.md) — full feature catalogue with per-target matrix
- [PLATFORM-SUPPORT](PLATFORM-SUPPORT.md) — web/Capacitor/Electron capability matrix
- [CREATING-A-DEVICE-APP](CREATING-A-DEVICE-APP.md) — extension guide
- [MOBILE-AUTH](MOBILE-AUTH.md) · [FCM](FCM.md) · [DEVICE-CAPTURE](DEVICE-CAPTURE.md) · [AI-REALTIME](AI-REALTIME.md)
- [AGENTS.md](../AGENTS.md) — engineering conventions
