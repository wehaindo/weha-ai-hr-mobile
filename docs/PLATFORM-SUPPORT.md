# Platform support — web · Capacitor · Electron

One codebase ships as three runtimes. This page is the **developer reference for
what runs where**: which features work on each platform, how they degrade when
they don't, and where the gating code lives. For the feature *catalog* see
[FEATURES.md](FEATURES.md); for the bridge design see
[ARCHITECTURE.md](ARCHITECTURE.md#the-framework-contract).

**Legend:** ✅ works · ⚠️ degraded (stub/empty/silent) · ❌ throws a descriptive
`Error` · 🚫 hidden by a module flag (build profile) — not an error, the UI
simply isn't there.

---

## 1. The two gating layers (read this first)

Every platform question resolves through **two independent gates**. Confusing
them is the most common source of "why is this feature missing/broken?".

| Layer | When | Decides | Where |
|---|---|---|---|
| **Build profile** (module flags) | `next build` — env is inlined | Which **nav items / settings tabs / routes** exist in the bundle | `NEXT_PUBLIC_APP_TARGET` → `src/lib/app-target.ts` → `device.config.ts` (`fullModules` / `minimalModules`) → `src/app/nav.config.ts`, `src/app/settings/layout.tsx`, `src/components/shell/app-shell.tsx` |
| **Runtime bridge** (capability) | Every app start | Which **capabilities** the running code can call (and how they behave) | `src/platform/index.tsx#getBridge()` → `electron/preload.ts` (Electron) or `src/platform/renderer-bridge.ts` (web + Capacitor) |

```
Build targets (package.json pins the env per script):

  npm run dev / build        → web         → minimal profile
  npm run electron:dev/build → electron    → full profile
  npm run cap:sync           → cap-tablet  → full profile
  npm run cap:sync:mobile    → cap-mobile  → minimal profile
```

- **Module flag off** → the tab/route/nav item is not rendered at all
  (`settings/layout.tsx` filters `TABS`; deep links redirect to `/settings/general`;
  `app-shell.tsx` shows "Not available … in the `<target>` build").
- **Module flag on, capability Electron-only** → the UI is present, but calling
  the capability on web/Capacitor **throws** (or degrades — see §3).

> **Never distinguish phone vs tablet at runtime** — they are separate bundles
> (separate `NEXT_PUBLIC_APP_TARGET`). Runtime detection only answers:
> *Electron, Capacitor-native, or browser?*

## 2. How the runtime platform is detected

`src/platform/index.tsx`:

```ts
export async function getBridge(): Promise<DeviceBridge> {
  if (isElectronBridge(window.deviceBridge)) return window.deviceBridge; // preload injected
  return createRendererBridge(isCapacitorNative() ? 'capacitor' : 'web');
  // Capacitor: window.Capacitor.isNativePlatform()  (runtime global from @capacitor/core)
}
```

- **Electron** — `electron/preload.ts` exposes `window.deviceBridge` via
  `contextBridge`; every call is `ipcRenderer.invoke(...)` to `electron/ipc/*`
  services in the main process. `platform === 'electron'`.
- **Capacitor / web** — both use `src/platform/renderer-bridge.ts`
  (`platform: 'capacitor' | 'web'`); sql.js WASM + IndexedDB persistence.
- App code **only** ever uses `useBridge()` / `getBridge()` (hard rule 1 in
  AGENTS.md) — never `window.electronAPI`, `indexedDB`, `fs` or Node APIs.

To branch in UI code, read the platform off the bridge:

```ts
const { bridge } = useBridge();
const isElectron = bridge.platform === 'electron';   // used by backup page, window controls, push page
```

## 3. How a capability behaves when unsupported (the contract)

Three degradation patterns exist — pick the right one when you add a capability:

| Pattern | Behavior | Used by |
|---|---|---|
| **Throw** | `throw new Error('<feature> requires Electron …')` — caller shows a toast | `print.raw`, `hardware.serial`, `hardware.exchange`, `hardware.openDrawer`, `cloud.googleOAuth`, `backup.saveToFile` / `openFile` |
| **Degraded value** | returns a harmless sentinel, never throws | `hardware.discover → []`, `hardware.test → { ok:false, message }`, `push.getToken → null`, `push.permission → 'unsupported'`, `window.control()` no-op, `notify()` no-op without `Notification` |
| **UI branch** | page checks `bridge.platform` and offers the web path instead | Backup (native dialog vs JSON download), window controls (hidden), Push page (platform-specific banner) |

Implementation: throw/degrade sites live in `src/platform/renderer-bridge.ts`
(web + Capacitor side) and are documented on the interface in
`src/platform/bridge.ts`. Call sites either branch first or `try/catch` into a
toast (`src/app/settings/hardware/page.tsx`).

## 4. Master capability matrix

### Core (runs everywhere)

| Capability | Web/PWA | Capacitor | Electron | Notes |
|---|:-:|:-:|:-:|---|
| SQLite engine (sql.js WASM) | ✅ | ✅ | ✅ | Same engine; **storage differs**: IndexedDB blobs (web/Cap) vs atomic `userData/device.db` file in the **main process** (Electron) |
| `db.query/execute/batch/flush`, `kv` | ✅ | ✅ | ✅ | Electron over IPC (`electron/ipc/db.ts`, `kv.ts`) |
| Migrations, records, repositories | ✅ | ✅ | ✅ | Unconditional |
| PIN / password login, roles & permissions | ✅ | ✅ | ✅ | `NEXT_PUBLIC_LOGIN_METHOD` env, not platform |
| WEHA mobile auth (password/OTP) | ✅ | ✅ | ✅ | Transport differs: Electron routes through `bridge.cloud.request` (main process, dodges CORS); web/Cap use browser `fetch` |
| Device auth + activation, Data Hub | ✅ | ✅ | ✅ | Raw `fetch` on **all** platforms → CORS applies on web/Cap; server URL override is runtime kv (`device.serverUrl`) |
| ERP sync engine + outbox | ✅ | ✅ | ✅ | `modules.sync = true` in **both** profiles |
| QR / camera scan | ✅ | ✅ | ✅ | Feature detection, no platform branch: `BarcodeDetector` (Chromium/Android) → `jsQR` fallback. **No `@capacitor/camera`** — plain `getUserMedia` |
| Geolocation | ✅ | ✅ | ✅ | Browser API everywhere; Electron preload mirrors it inline (no IPC) |
| Local notifications (`bridge.notify`) | ✅ | ✅ | ✅ native | Capability probe (`typeof Notification`) |
| Data retention, security policy, integrations registry | ✅ | ✅ | ✅ | Modules on in both profiles |
| 3D (`three`, lazy) | ✅ | ✅ | ✅ | `modules.three` on in both |

### Electron-only (web/Capacitor ❌ or ⚠️)

| Capability | Web | Capacitor | Electron | Failure mode off-Electron |
|---|:-:|:-:|:-:|---|
| Raw printing (`bridge.print.raw`) — TCP 9100 **and** Windows driver queue | ❌ | ❌ | ✅ | throws; print jobs land in `print_queue` as `failed` |
| — Windows printer (winspool raw) | 🚫 | 🚫 | ✅ *Windows only* | `electron/services/windows-print.ts`; discovery returns `[]` when `process.platform !== 'win32'` |
| Serial I/O (`hardware.serial`), device exchange (`hardware.exchange`), cash drawer | ❌ | ❌ | ✅ | throws; needs optional native dep `serialport` (not in package.json → actionable error if missing) |
| Device discovery / hardware test | ⚠️ `[]` | ⚠️ `[]` | ✅ | PowerShell `Get-Printer` etc. |
| Native `.db` backup dialogs | ❌ | ❌ | ✅ | throws → use `exportJson`/`importJson` (JSON download/upload works on all three) |
| Google OAuth code flow | ❌ | ❌ | ✅ | throws ("OAuth needs a backend") |
| Window controls (min/max/close), frameless chrome | 🚫 | 🚫 | ✅ | `window-controls.tsx` returns `null`; `window.control()` is a no-op |
| Secondary display window | ✅ new tab | ⚠️ single-window app | ✅ fullscreen window | `renderer-bridge.ts` only calls `window.open` when `platform === 'web'` |
| ECR / payment terminal I/O | 🚫 module off | cap-tablet only | ✅ | module `ecr` + `hardware.exchange` |
| Main-process `ws` realtime transport | browser `WebSocket` ✅ | browser `WebSocket` ✅ | Node `ws` ✅ | same `RealtimeClient`, injected socket factory |

### Push / FCM (platform-specific acquisition)

| | Web/PWA | Capacitor | Electron |
|---|---|---|---|
| FCM token | ✅ Firebase JS SDK + generated `firebase-messaging-sw.js` (needs `NEXT_PUBLIC_FIREBASE_*`) | ✅ `@capacitor/push-notifications` (needs `google-services.json`) | ⚠️ **no Push API** (packaged builds serve over insecure `app://`) → `isSupported:false`, `getToken:null`, falls back to local `notify()` |
| Settings → Push hints | "Firebase web config not set" banner | plugin banner | "Electron cannot acquire an FCM token" banner |

Gates: `modules.push` (on everywhere) **and** per-device KV `push.enabled`.

> **Capacitor caveat:** only `@capacitor/push-notifications` is installed and
> imported. The generated Android project currently syncs **zero plugins**
> (`android/app/src/main/assets/capacitor.plugins.json` is `[]`) — run
> `npx cap sync android` after adding/changing plugins.

### Module profile matrix (build-time UI surface)

| Module flag | full (electron, cap-tablet) | minimal (web, cap-mobile) |
|---|:-:|:-:|
| `sync`, `integration`, `datahub`, `hardware`, `security`, `retention`, `push`, `three` | ✅ | ✅ |
| `print`, `ecr`, `onScreenKeyboard` | ✅ | ❌ |
| `realtime`, `aiRealtime`, `cloud`, `google`, `grist`, `supabase` | ✅ | ❌ |
| `backup`, `aiVoice`, `testing` | ✅ | ❌ |

⚠️ **Trap:** `hardware` is **on** in the minimal profile, so Settings →
Hardware renders on web — but its I/O (serial/test/drawer/print) still requires
Electron. The page is intentionally usable for *registering* devices; tests
degrade to toasts/empty discovery. Similarly `backup` code runs everywhere but
the **tab** is hidden on minimal builds.

## 5. Feature-by-feature reference

### Database
- Engine: `src/db/engine.ts` (sql.js) — runs in the renderer on web/Capacitor
  and in the **main process** on Electron (`electron/services/database.ts`).
- Persistence: `IndexedDbBlobStore` (`src/db/persistence.ts`) vs `FileBlobStore`
  (atomic tmp+rename under `app.getPath('userData')`).
- There is **no native SQLite** (no `better-sqlite3`, no `@capacitor/*-sqlite`).

### Printing
- **Compile everywhere** (pure code): ESC/POS buffer, receipt renderer, ZPL,
  template designer — `src/lib/print/*`.
- **Dispatch only on Electron**: `printer-adapter.ts` routes serial targets to
  `hardware.serial` and everything else to `print.raw`; both throw off-Electron.
- Transport in main: `host:port` → raw TCP 9100; otherwise
  `sendToWindowsDriver()` (winspool `WritePrinter`, Windows-only).
- No `window.print()` fallback exists — on web, queued jobs end as `failed`.

### Hardware / settings page
- Records CRUD + Settings → Hardware page work on **all** platforms (module on
  in both profiles); only the *tests* and I/O differ (see matrix).
- Scales/scanners are **device types + protocol registry** entries
  (`src/lib/hardware/`), not drivers — device apps register their own.

### Sync & cloud
- ERP sync/outbox: all platforms, both profiles.
- Supabase / Google Sheets / Grist, Realtime, AI Realtime: module `cloud`/
  `google`/`grist`/`supabase`/`realtime` — **full profile only** (web and
  cap-mobile hide the tabs; workers skip booting via
  `useCloudSyncWorkers.ts` module checks).
- Cloud HTTP: `bridge.cloud.request` — Electron main-process fetch (no CORS),
  browser `fetch` on web/Cap.

### Files / backup
- Portable JSON export/import/clear (`src/lib/backup/service.ts`) works
  everywhere (blob download / file input).
- Native save/open dialogs: Electron only (`electron/services/backup.ts`).
- No `@capacitor/filesystem` — Capacitor takes the JSON path.

### Camera, GPS
- `src/lib/scan/qr-session.ts` + `src/platform/renderer-location.ts` — plain
  web APIs, feature-detected; identical on all three platforms (Electron
  preload mirrors location inline).

## 6. Gotchas checklist

- **CORS** — browser `fetch` on web/Capacitor must be allowed by the backend;
  Electron main-process requests are exempt. If it works in Electron but 403/0s
  on web, check CORS, not auth.
- **`NEXT_PUBLIC_*` is inlined at build** — changing `.env` requires a rebuild
  of *that target*; phone and tablet are different bundles.
- **Electron main owns the DB and hardware** — renderer only talks IPC through
  the preload bridge; never add per-entity IPC channels (AGENTS.md: main is a
  service host, no business logic).
- **Optional native deps** — `serialport` is loaded defensively in
  `electron/services/hardware.ts`; absence yields an actionable error, not a crash.
- **Windows-only paths** — winspool printing and printer discovery gate on
  `process.platform === 'win32'`.
- **Push on Electron** is a deliberate stub — do not "fix" it with the Firebase
  web SDK; the insecure `app://` origin cannot register a service worker
  registration reliably. Use local notifications.
- **Degrade, don't crash** — new capability? Choose a pattern from §3 and add
  the matching note to the matrix above.

## 7. Adding a capability (checklist)

1. Declare it on the interface in `src/platform/bridge.ts` with a JSDoc
   contract stating per-platform behavior.
2. Implement in **both** sides:
   - Electron: `electron/preload.ts` (expose) → `electron/ipc/<area>.ts` →
     `electron/services/<area>.ts` (logic in main).
   - Web/Capacitor: `src/platform/renderer-bridge.ts` — implement, or
     `throw` / return a degraded value per §3.
3. Decide whether it needs a **module flag** (`device.config.ts` — both
   profiles; TypeScript enforces completeness) and, if so, attach it to the
   nav item / settings tab.
4. In UI, either `bridge.platform === 'electron'` branch or `try/catch` → toast.
5. Add tests (`__tests__/`, Vitest) and update the matrices in **this file**
   and [FEATURES.md](FEATURES.md).
6. Run `npx tsc --noEmit`, `npm run lint`, `npm run test:run`.

## Related docs

- [FEATURES.md](FEATURES.md) — what the framework ships, by category
- [ARCHITECTURE.md](ARCHITECTURE.md) — bridge, database, sync, auth
- [CREATING-A-DEVICE-APP.md](CREATING-A-DEVICE-APP.md) — extension guide
- [FCM.md](FCM.md) — push setup on web + Capacitor
- [DEVICE-CAPTURE.md](DEVICE-CAPTURE.md) — QR/camera + GPS
