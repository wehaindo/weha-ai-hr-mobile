# Creating a device app

Every device app is this template with a different identity and its own domain
routes. The framework stays untouched.

## 1. Scaffold the identity

```bash
cp -r weha-device-framework my-kiosk-app   # or git clone + rename
cd my-kiosk-app
npm install
npm run init-app -- --name "Kiosk App" --id com.weha.kiosk --port 3030 --brand "Kiosk"
```

`init-app` rewrites `device.config.ts`, `package.json` (name + ports) and
`electron-builder.yml` (appId + productName). Verify with `npm run dev`, sign in
as admin (PIN 1234), change the PIN.

## 2. Define your schema

Create `src/db/migrations/0005_products.ts`:

```ts
import type { Migration } from '../migrate';

export const migration0005Products: Migration = {
  id: '0005_products',
  up: (db) => {
    db.execute(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price INTEGER NOT NULL DEFAULT 0,   -- money as integers, no decimals
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  },
};
```

Register it in `src/db/migrations/index.ts` (`frameworkMigrations` array).
Migrations run on every platform automatically — never hand-write `CREATE TABLE`
elsewhere. Rules:

- Number ids lexicographically (`0005_`, `0006_`…); never edit an applied migration.
- Columns: `created_at`/`updated_at` ISO strings, booleans as 0/1, money as
  integers, text PKs from `generateId()`.
- Always query rows by column name (`bridge.db.query` already does).

## 3. Add a repository

Keep SQL in one module per domain, `src/app/<domain>/repo.ts`:

```ts
import type { DeviceBridge } from '@/platform';
import { generateId } from '@/lib/id';
import { enqueueSync } from '@/sync/outbox';

export async function listProducts(bridge: DeviceBridge) {
  return bridge.db.query('SELECT * FROM products WHERE is_active = 1 ORDER BY name');
}

export async function createProduct(bridge: DeviceBridge, name: string, price: number) {
  const id = generateId();
  const now = new Date().toISOString();
  await bridge.db.execute(
    'INSERT INTO products (id, name, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, price, now, now]
  );
  // optional: sync to the ERP
  await enqueueSync(bridge, {
    entityType: 'product',
    entityId: id,
    action: 'create',
    payload: { id, name, price },
  });
  return id;
}
```

## 4. Add routes + navigation

Create `src/app/products/page.tsx` (all pages are `'use client'`) and register it
in `src/app/nav.config.ts`:

```ts
{ label: 'Products', href: '/products', icon: PackageIcon, permission: 'products.use' },
```

The sidebar shows the item, the shell gates the route, and the permission comes
from the role map. Add the permission to `src/auth/permissions.ts` (and to the
roles you want) via a new migration on `role_permissions`.

Kiosk/display screens: add `fullscreen: true` to the nav item.

## 5. Sync with the ERP (optional)

```ts
// src/app/products/sync.ts
import { registerApplier } from '@/sync/registry';
import { getSyncEngine } from '@/sync/useSyncWorker';

registerApplier('product', async (bridge, items) => {
  // upsert items into local tables; the engine calls this on every pull
});

// at startup (e.g. in providers or a settings page):
const engine = getSyncEngine(bridge);
await engine.registerDefinition({ entityType: 'product', direction: 'outbound', configCode: 'PRODUCT' });
await engine.registerDefinition({ entityType: 'product', direction: 'inbound', configCode: 'PRODUCT' });
```

Device activation happens at Settings → Sync (paste the ERP activation token).
`enqueueSync()` covers everything that must reach the ERP; inbound pulls call
your applier.

## 6. Printing (optional)

Add a printer in Settings → Printers, then:

```ts
import { PrintService } from '@/lib/print';
import { buildTestPage } from '@/lib/print/escpos';

const print = new PrintService(bridge);
await print.print(undefined, 'receipt', buildTestPage('Counter printer'));
```

Electron main sends raw TCP (`host:9100`) or to a Windows driver. For web apps
there is no raw printing — gate the UI on `bridge.platform === 'electron'`.

## 7. Ship it

```bash
npm run test:run && npm run test:e2e
npm run build                    # web artifact → out/
npm run electron:build           # desktop installers
npx cap add android              # once
npm run cap:sync                 # then build in Android Studio / Xcode
```

## Checklist of things you should NOT do

- Don't add `window.electronAPI` calls — everything goes through `useBridge()`.
- Don't add Next API routes or server actions — the app is a pure client.
- Don't write ad-hoc DDL — use migrations.
- Don't store secrets in `device.config.ts` — it is bundled into the client.
- Don't add per-entity IPC handlers — SQL belongs in renderer repositories.
