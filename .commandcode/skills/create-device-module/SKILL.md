---
name: create-device-module
description: Add a new feature module with its own SQLite table to this device app — migration, module flag, nav/settings gating, page, repository, permission, integration seed (integration_entities + field maps), and verification. Use when the user asks to add a module, create a table with a page, seed an integration for a module, scaffold a new domain (e.g. "add a widgets module", "new feature with a table"), or extend the device framework with a feature that needs its own data.
argument-hint: "<module-name>"
---

# Create a new device module (with a table)

Every feature in this repo is a **module**: a table created by a migration, a flag in
`device.config.ts`, and a gated route. Work through the steps in order; skip only the
optional steps the user did not ask for.

**Naming:** if the invocation carried an argument (e.g. `/create-device-module widgets`),
use it as the module name throughout, otherwise take it from the request. Convention:
module key + route = one lowercase word (`widgets`), table = `widgets`, permission =
`widgets.use`.

## 1. Migration — create the table

1. Read `src/db/migrations/index.ts` and take the **highest id + 1** (currently `0030`;
   `0028` was skipped — never reuse gaps, never edit an applied migration).
2. Create `src/db/migrations/0031_widgets.ts`:

```ts
import type { Migration } from '../migrate'; // RELATIVE — src/db is shared with Electron main

export const migration0031Widgets: Migration = {
  id: '0031_widgets',
  up: (db) => {
    db.execute(`
      CREATE TABLE widgets (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `);
  },
};
```

3. Register it in `src/db/migrations/index.ts`: add the import **and** append to the
   `frameworkMigrations` array.

Data conventions (AGENTS.md): ids from `generateId()` (16-char hex), timestamps ISO-8601
UTC strings, booleans 0/1, money integer minor units, tax basis points. Queries must map
rows **by column name** — never depend on column order (`ALTER TABLE` breaks that
silently). Migrations run on every platform at boot; no other file may contain DDL.

## 2. Module flag — `device.config.ts`

Add the key to **both** `fullModules` and `minimalModules` — the `ModuleFlags` type makes
the build fail until both are updated.

Decision rule: desktop/tablet only → `false` in `minimalModules`; also wanted on
web/phone → `true` in `minimalModules`.

## 3. Navigation (auto-gated)

`src/app/nav.config.ts` → `NAV_ITEMS`:

```ts
{ label: 'Widgets', href: '/widgets', icon: PackageIcon, permission: 'widgets.use', module: 'widgets' },
```

Has a settings area? Add a TAB carrying `module: 'widgets'` in
`src/app/settings/layout.tsx`.

Gating is automatic — do not hand-roll it: the sidebar filters via
`navItemsForTarget()`, the shell blocks direct URLs to disabled modules, and deep links
to hidden settings tabs redirect to `/settings/general`.

## 4. Page

`src/app/widgets/page.tsx` — every page/component touching browser APIs must start with
`'use client'`.

## 5. Repository — where SQL lives

`src/app/widgets/repo.ts`:

```ts
import type { DeviceBridge } from '@/platform';
import { generateId } from '@/lib/id';

export async function listWidgets(bridge: DeviceBridge) {
  return bridge.db.query('SELECT * FROM widgets WHERE is_active = 1 ORDER BY name');
}

export async function createWidget(bridge: DeviceBridge, name: string) {
  const id = generateId();
  const now = new Date().toISOString();
  await bridge.db.execute(
    'INSERT INTO widgets (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, name, now, now]
  );
  return id;
}
```

All platform access goes through `useBridge()` / `DeviceBridge` — never
`window.electronAPI`, `indexedDB`, `fs` or Node APIs.

## 6. Permission (optional)

New migration inserting into `role_permissions` — copy
`src/db/migrations/0019_testing_permission.ts` as the model. Reference `widgets.use` in
the nav item; the role map lives in `src/auth/permissions.ts`.

## 7. ERP sync (optional)

### 7a. Register + seed the integration (pull via device auth)

Four touch points — mirror the `employees` / `portal_users` integration exactly.
The backend must have a matching external-API config code (added in weha-framework
via `scripts/seed-external-api-configs.ts`) or pulls will 404.

**1. Register the natural key** — `src/sync/useSyncWorker.ts`, inside the effect
before `syncEngine.load()`:

```ts
registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['id'], deltaColumn: 'updated_at' });
```

`keys` are the pull-upsert match columns (match → UPDATE, else INSERT);
`deltaColumn` enables incremental push.

**2. Seed the row + field maps** — add an idempotent seed to
`src/integration/seed.ts`. Runtime seed, **never a migration**: seeds inside
migrations pollute every fresh test DB and collide on `entity_type` (UNIQUE).

```ts
export async function seedWidgetIntegration(bridge: DeviceBridge): Promise<void> {
  const existing = await bridge.db.query<{ id: string }>(
    "SELECT id FROM integration_entities WHERE entity_type = 'widgets'"
  );
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO integration_entities
       (id, entity_type, name, type, status, base_url, api_key, sync_source, endpoint, sync_direction, schedule, page_size, enabled, created_at, updated_at)
     VALUES (?, 'widgets', 'Widgets (WEHA)', 'rest', 'idle', '', NULL, 'device', 'WIDGETS', 'pull', '5m', 100, 1, ?, ?)`,
    ['int-widgets', now, now]
  );

  // local column ← external field (pull direction)
  const fieldMaps: Array<[source: string, target: string]> = [
    ['id', 'id'],
    ['name', 'name'],
    ['is_active', 'isActive'],
  ];
  for (const [source, target] of fieldMaps) {
    await bridge.db.execute(
      `INSERT INTO integration_field_maps
         (id, integration_entity_id, entity_type, source_field, target_field, direction, created_at, updated_at)
       VALUES (?, ?, 'widgets', ?, ?, 'pull', ?, ?)`,
      [`fm-widgets-${source}`, 'int-widgets', source, target, now, now]
    );
  }
}
```

Conventions: entity id `int-<entityType>`; `sync_source` = `device` (REST via
device auth) | `datahub` | `api_key` (`base_url`/`api_key` only matter for
`api_key`); `endpoint` = backend config code; never map `updated_at` (the write
path owns it).

**3. Wire it at boot** — chain before `syncEngine.load()` in
`src/sync/useSyncWorker.ts`:

```ts
seedProductIntegration(bridge)
  .then(() => seedIdentityIntegrations(bridge))
  .then(() => seedWidgetIntegration(bridge))
  .catch(() => undefined)
  .then(() => (cancelled ? undefined : syncEngine.load()))
```

**4. Test** — copy `__tests__/integration/device-sync-identity.test.ts`:
`createFakeBridge()` → `registerIntegrationEntity(...)` → run the seed **twice**
(no duplicate rows) → assert the `integration_entities` row
(`sync_source: 'device'`, `endpoint: 'WIDGETS'`, `enabled: 1`), the field-map
count, and that `updated_at` is not mapped.

Device-auth REST pulls need no applier — the per-entity engine upserts through
the field maps + registered def. For outbound mutations (`enqueueSync`) and other
pipelines see `docs/CREATING-A-DEVICE-APP.md` §5.

## 8. Verify

```bash
npx tsc --noEmit && npm run lint && npm run test:run
npm run dev    # sidebar shows the item; hidden on minimal builds if the flag is false there
```

`__tests__/db/migrate.test.ts` asserts framework migrations apply exactly once on a fresh
DB — extend it if the module seeds reference data.

## Don'ts (AGENTS.md)

- No DDL outside migrations; never edit an applied migration.
- No Next API routes / server actions / middleware — the app is a pure static client.
- Relative imports inside `src/db/**` (compiled for Electron main): `../foo`, not `@/foo`.
- No secrets in `device.config.ts` — it is bundled into the client.
- No per-entity IPC handlers — SQL belongs in renderer repositories.

Related: `docs/CREATING-A-DEVICE-APP.md` (full walkthrough), `docs/PLATFORM-SUPPORT.md`
(where each capability runs).
