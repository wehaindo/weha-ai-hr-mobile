# AGENTS.md — conventions for agents working in this repo

## What this repo is

A device-app **template/framework**: Next.js 16 (static export) + Electron +
Capacitor, offline-first SQLite, PIN auth, themes, ERP sync. New device apps are
copies of this repo with a different `device.config.ts` identity and their own
domain routes. POS/domain logic does not belong here.

Read `docs/ARCHITECTURE.md` before making structural changes.

## Hard rules

1. **All platform access goes through the DeviceBridge** (`useBridge()` in
   React, constructor injection elsewhere). Never touch `window.electronAPI`,
   `indexedDB`, `fs`, or Node APIs from app code.
2. **No API routes, no server actions, no Next middleware.** The app is a pure
   client; `next build` must keep producing a working static `out/`.
3. **Schema changes = new migration files** in `src/db/migrations/`
   (id `000N_name`, exported in `migrations/index.ts`). Never edit an applied
   migration; never issue DDL outside migrations.
4. **Relative imports in files shared with Electron main** (`src/db/**`,
   `src/auth/permissions.ts`, `src/lib/id.ts`, `device.config.ts`): use
   `../foo`, not `@/foo` — tsc does not rewrite path aliases for the compiled
   Electron output. Renderer-only files use `@/` aliases.
5. **Queries map rows by column name** (the engine uses `getAsObject`); never
   depend on column order — `ALTER TABLE` will break you silently.
6. **Data conventions**: money = integer minor units, tax = basis points,
   booleans = 0/1, timestamps = ISO-8601 UTC strings, ids = 16-char hex from
   `generateId()` (Web Crypto, not `node:crypto`).

## Layout cheat sheet

- App identity/branding/ports → `device.config.ts` (single source of truth)
- Platform seam → `src/platform/` (+ `electron/preload.ts` mirror)
- Electron main → `electron/main.ts` + `services/` + `ipc/` (keep it slim;
  no business logic in main — it is a service host)
- DB engine/migrations → `src/db/`
- Auth/permissions → `src/auth/`, session in `src/stores/auth.ts`
- Sync → `src/sync/` (DeviceClient, outbox, engine, appliers)
- Shell/nav → `src/components/shell/`, `src/app/nav.config.ts`
- UI kit → `src/components/ui/` (shadcn, base-nova style; do not hand-roll primitives)
- Example device app → `src/app/{dashboard,settings,sync}`

## Conventions

- All pages/components that use browser APIs are `'use client'`.
- State: zustand + `persist` for session/layout; no react-query/redux.
- Toasts: `import { toast } from '@/components/ui/toast'` → `toast.add({ title, type })`.
- Base UI primitives use the `render={<Button />}` prop, NOT `asChild`.
- Tests: Vitest in `__tests__/` (jsdom, `@` alias), Playwright in `tests/e2e/`
  (serial, port 3000). The web bridge runs real sql.js against IndexedDB-mocked
  storage; prefer real sql.js over fake SQL mocks.
- Run `npx tsc --noEmit`, `npm run lint`, `npm run test:run` before finishing.

## Electron specifics

- Main is TypeScript, compiled by `electron/tsconfig.json` (rootDir `..` →
  `electron/dist/`). `package.json#main` points at `electron/dist/electron/main.js`.
- The database lives in the main process; windows talk to it over the four
  generic IPC channels. Add capability methods to the bridge, never per-entity
  handlers.
- Packaged builds serve `out/` through the `app://` protocol; never hardcode
  `http://localhost`.
- Persistence is atomic (tmp + rename) under `app.getPath('userData')` — never
  write inside `app.getAppPath()` (that is inside asar when packaged).

## When extending for a device app

Follow `docs/CREATING-A-DEVICE-APP.md`. Keep framework files generic: if a
change is domain-specific, it belongs in the app's own routes/repos/migrations,
not in `src/platform`, `src/db/engine`, `electron/`, or the shell.
