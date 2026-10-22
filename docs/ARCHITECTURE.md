# Architecture

## The framework contract

1. **Pure client app.** `next build` with `output: 'export'` → `out/`. No API
   routes, no server actions, no Next middleware. Electron loads `out/` via the
   `app://` custom protocol (`electron/services/protocol.ts`) so path routing
   works without a server. Capacitor ships `out/` as `webDir`.
2. **One seam: `DeviceBridge`** (`src/platform/bridge.ts`). App code never
   touches `window.electronAPI`, IndexedDB, or Node APIs. The bridge exposes:
   - `db.query / db.execute / db.batch` — SQL against the shared SQLite database
   - `kv.get / set / remove` — device_settings-backed key/value
   - `notify`, `window.open/control`, `print.raw`
   - `events.on('db:changed' | 'command' | 'window:state' | 'sync:status')`
3. **One DB engine: sql.js WASM** (`src/db/engine.ts`), run where the platform
   dictates:
   - Electron: in the **main process** (all windows share one database),
     persisted to `app.getPath('userData')/device.db` with debounced atomic
     writes (tmp file + rename — crash-safe).
   - Web/Capacitor: in the **renderer**, persisted as a blob in IndexedDB.
   Rows are always mapped by column name (`getAsObject`), never by position, so
   `ALTER TABLE` migrations can't silently break queries.
4. **Migrations, not ad-hoc DDL.** `src/db/migrations/000N_*.ts` each export
   `{ id, up(db) }`. The runner (`src/db/migrate.ts`) applies pending ones in
   order inside a transaction and records them in `_migrations`. Runs at startup
   on every platform (Electron main before window creation; renderer during
   provider boot with a splash).
5. **Identity in `device.config.ts`.** App name/id, port, brand, ERP base URL,
   module switches. Imported by the Next app (client-safe: static object, no
   secrets), by Electron (compiled by `electron/tsconfig.json`), and by
   `capacitor.config.ts`.

## Data flow: a typical mutation

```
UI action
  → repository function (src/app/<domain>/repo.ts, plain SQL via bridge)
  → bridge.db.execute(...)           // local write, immediate — works offline
  → enqueueSync(bridge, {...})       // optional: outbox row for ERP push
  → sync engine (background)         // drains outbox when ERP is reachable
```

There is no cache layer or server state library: the database is local and fast;
subscribe to `db:changed` (or reload after writes) to refresh views.

## Sync (WEHA ERP)

- `src/sync/device-client.ts` — HTTP protocol: activation (`/api/device/activate`
  → device token), CRUD at `/api/device/{configCode}?tenantId=…`, heartbeat.
  Token persists in the `integrations` table.
- `src/sync/outbox.ts` — `sync_queue` table: every mutation you enqueue survives
  offline; statuses pending → processing → done/failed with retry counting.
- `src/sync/engine.ts` — periodic loop: push outbox (per `sync_definitions`
  outbound rows) → pull inbound definitions → apply via registered appliers →
  heartbeat → update `sync_store` + `sync_log`.
- `src/sync/registry.ts` — `registerApplier('product', async (bridge, items) => …)`
  tells the engine how each entity lands in local tables. The engine never
  knows your schema.
- UI: `SyncIndicator` in the header, full monitor at `/sync` (activation form,
  queue stats, connection test, activity log).

## Auth

- PIN + bcrypt (`src/auth/crypto.ts`) — bcryptjs is pure JS, so hashing runs in
  the renderer on every platform.
- Session: zustand + localStorage (`device-auth`), 5 attempts → 30s lockout.
- Permissions: registry in `src/auth/permissions.ts`, seeded roles
  (admin/manager/operator) in migration `0004_seed`, DB-backed `role_permissions`.
  `useAuthStore.can(permission)` for logic, `<RequirePermission>` for subtrees,
  nav items declare a `permission` and the sidebar/gate enforce it.
- `useAuthBootstrap` re-reads permissions on boot so role changes apply without
  re-login.

## Theming

- Light/dark via `next-themes` (`class` attribute).
- Accent presets (`default` amber / `ocean` / `contrast`) as `[data-theme=…]`
  token overrides in `globals.css`, applied from `src/ui/themes.ts`
  (localStorage-persisted). Manage in Settings → Appearance.
- Brand strings/logo in `device.config.ts` `brand` block.

## Shell & device profiles

`src/components/shell/app-shell.tsx` derives chrome from `src/app/nav.config.ts`:

- `public: true` → no auth, bare layout (login at `/`)
- `fullscreen: true` → no sidebar/header (kiosk, displays)
- `permission` → route gated + sidebar filtered

`useDeviceProfile` detects phone/tablet/pos/kiosk from viewport + touch and
feeds responsive rules. `TouchKeyboard` (react-simple-keyboard) mounts globally
when `modules.onScreenKeyboard` is on.

## Print & hardware

- `src/lib/print/index.ts` — `PrintService`: printer_profiles CRUD, byte send via
  `bridge.print.raw` (Electron main: raw TCP socket, Windows-driver fallback via
  `Out-Printer`; web throws — printing is a desktop/native capability), job log
  in `print_queue`.
- `src/lib/print/escpos.ts` — minimal ESC/POS builder + test page. Bring your
  own renderer for real documents, or extend this.
- `src/lib/hardware/index.ts` — protocol registry skeleton; device apps register
  protocols (`registerProtocol`) for their peripherals.

## Testing strategy

- **Vitest** (`__tests__/`): engine + migrations against real sql.js (memory
  blob store), outbox, permissions, auth store, sync engine against an
  in-process HTTP fake of the ERP.
- **Playwright** (`tests/e2e/`): full flows in a browser; the web adapter needs
  no Electron, and a scripted mock bridge (`tests/e2e/helpers/mock-bridge.ts`)
  covers platform-specific behavior.
