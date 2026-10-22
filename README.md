# WEHA Device Framework

A reusable, offline-first foundation for device applications. One codebase runs as:

- **Web** — static export, data in the browser (sql.js + IndexedDB)
- **Electron** — desktop app, data in the main process (SQLite file under `userData`)
- **Capacitor** — Android/iOS, same renderer database path as web

Built from the production-hardened ai-pos codebase, stripped of POS domain logic.

## Quick start

```bash
npm install
npm run dev            # web on http://localhost:3180
```

Sign in with the seeded admin (PIN **1234**), then change it in Settings → Users.

### Other targets

```bash
npm run dev:electron   # desktop shell against the dev server
npm run build          # static export to out/
npm run electron:build # packaged desktop app (NSIS/dmg/AppImage)
npm run cap:sync       # build + sync into android/ ios/ (run `npx cap add android` once)
```

### Start a new device app

```bash
npm run init-app                      # interactive
npm run init-app -- --name "Kiosk X" --id com.weha.kioskx --port 3020
```

This rewrites the app identity in `device.config.ts`, `package.json` and
`electron-builder.yml`. Everything else is framework.

## Architecture in one screen

```
app code (routes, components)
        │  uses
        ▼
DeviceBridge (src/platform)          ← the ONLY platform seam
  ├── electron: IPC → main process (sql.js, file at userData/device.db)
  ├── web:      sql.js + IndexedDB
  └── capacitor: sql.js + IndexedDB
        ▲
migrations (src/db/migrations) run on every platform before boot
```

- **No API routes, no server.** `next build` produces a static `out/`. Electron
  serves it through the `app://` protocol; Capacitor ships it as the web bundle.
- **Generic IPC.** There are ~15 bridge methods (`db:query`, `db:execute`,
  `kv:*`, `print:raw`, `window:*`, …). App SQL lives in renderer repositories —
  new device apps never touch Electron main.
- **Migrations, not ad-hoc DDL.** Numbered files in `src/db/migrations/`,
  tracked in `_migrations`. Same schema everywhere.
- **Sync outbox.** Mutations you want synced go through `enqueueSync()`; the
  engine drains them when the WEHA ERP is reachable (see `src/sync/`).
- **PIN auth with roles/permissions.** Seeded admin, DB-backed role →
  permission map, `RequirePermission` guards, permission-filtered sidebar.

Key directories:

| Path | Purpose |
|---|---|
| `device.config.ts` | App identity, port, brand, ERP URL, module switches |
| `electron/` | Slim main process: services + generic IPC |
| `src/platform/` | DeviceBridge interface + the three adapters |
| `src/db/` | Engine, migrations, persistence |
| `src/auth/` | Login, PIN crypto, permissions |
| `src/sync/` | DeviceClient, outbox, engine, appliers |
| `src/components/shell/` | AppShell, sidebar, header, theme toggle |
| `src/app/` | Example device app (dashboard, settings, sync) |
| `scripts/init-app.ts` | New-device-app scaffolding |

## Default login

| User | Role | PIN |
|---|---|---|
| Administrator | admin (all permissions) | 1234 |

Change it immediately on a real device.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — bridge, database, sync, auth, theming
- [Creating a device app](docs/CREATING-A-DEVICE-APP.md) — step-by-step extension guide
- [Mobile auth](docs/MOBILE-AUTH.md) — WEHA-account login (password/OTP), setup links, env config
- [ESS Phase 1](docs/ESS-PHASE1.md) — framework assessment & deployment decision
- [ESS Phase 2](docs/ESS-PHASE2.md) — employee dashboard & profile (acceptance evidence)
- [ESS API contract](docs/ESS-API-CONTRACT.md) — backend interface the ESS client is built against
- [AGENTS.md](AGENTS.md) — conventions for AI agents working in this repo
