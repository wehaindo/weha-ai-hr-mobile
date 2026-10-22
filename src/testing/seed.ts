// Opt-in, idempotent seed for the Testing-module fixtures (adopted from
// weha-framework). Rows use deterministic ids + `INSERT OR IGNORE`, so re-running
// never overwrites edited rows. `registerTestSyncEntities` wires the models into
// the per-entity + Data Hub registries so the sync engines have ready-to-push data.

import type { DeviceBridge } from '@/platform';
import { registerIntegrationEntity } from '@/integration/entities';
import { registerHubEntity } from '@/integration/hub-entities';
import { registerOrderlineSource } from '@/integration/orderline-source';
import { listTestModels } from './registry';

function now(): string {
  return new Date().toISOString();
}

// Placeholder endpoint for the seeded test integrations. Point each at your real
// ERP/API endpoint and enable it on the Integrations page to exercise sync.
const TEST_INTEGRATION_BASE = 'http://localhost:3178';

// ── Fixture data (ported from weha-framework test-models.ts, minor-unit money) ──

const SEED_LOOKUPS: [string, string, string][] = [
  ['tl-0001', 'LOOKUP-A', 'Lookup A'],
  ['tl-0002', 'LOOKUP-B', 'Lookup B'],
  ['tl-0003', 'LOOKUP-C', 'Lookup C'],
  ['tl-0004', 'LOOKUP-D', 'Lookup D'],
];

// id, code, name, category, price, quantity, is_active, launched_at, notes
const SEED_PRODUCTS: [string, string, string, string, number, number, number, string | null, string | null][] = [
  ['tp-0001', 'TP-0001', 'Steel Bolt M8', 'RAW', 1200, 500, 1, '2026-01-15', 'Primary fastener'],
  ['tp-0002', 'TP-0002', 'Brass Fitting 3/4', 'FINISHED', 4500, 120, 1, '2026-02-01', null],
  ['tp-0003', 'TP-0003', 'Hydraulic Oil 5L', 'RAW', 89000, 40, 1, null, 'Bulk item'],
  ['tp-0004', 'TP-0004', 'Assembly Service', 'SERVICE', 250000, 0, 1, '2026-03-10', 'Per-unit labour'],
  ['tp-0005', 'TP-0005', 'Firmware License', 'DIGITAL', 150000, 999, 0, '2026-04-02', null],
  ['tp-0006', 'TP-0006', 'Copper Wire 2mm', 'RAW', 3200, 800, 1, '2026-01-20', null],
  ['tp-0007', 'TP-0007', 'Aluminium Sheet', 'FINISHED', 15500, 60, 1, '2026-02-14', 'Cut to size'],
  ['tp-0008', 'TP-0008', 'Calibration Service', 'SERVICE', 75000, 0, 0, null, null],
  ['tp-0009', 'TP-0009', 'Sensor Module', 'DIGITAL', 420000, 25, 1, '2026-05-05', null],
  ['tp-0010', 'TP-0010', 'Packaging Box', 'FINISHED', 800, 2000, 1, '2026-01-05', 'Corrugated'],
];

// id, reference, status, customer_name, total, ordered_at, notes
const SEED_ORDERS: [string, string, string, string, number, string, string | null][] = [
  ['to-0001', 'ORD-2026-001', 'CONFIRMED', 'Acme Corp', 16500, '2026-06-01', 'Expedite'],
  ['to-0002', 'ORD-2026-002', 'DRAFT', 'Globex', 250000, '2026-06-03', null],
  ['to-0003', 'ORD-2026-003', 'COMPLETED', 'Initech', 47000, '2026-05-20', null],
  ['to-0004', 'ORD-2026-004', 'CANCELLED', 'Umbrella', 420000, '2026-05-28', 'Customer cancel'],
];

// id, order_id, sku, description, quantity, unit_price, line_total
const SEED_LINES: [string, string, string, string, number, number, number][] = [
  ['tol-0001-1', 'to-0001', 'TP-0001', 'Steel Bolt M8', 10, 1200, 12000],
  ['tol-0001-2', 'to-0001', 'TP-0002', 'Brass Fitting 3/4', 1, 4500, 4500],
  ['tol-0002-1', 'to-0002', 'TP-0004', 'Assembly Service', 1, 250000, 250000],
  ['tol-0003-1', 'to-0003', 'TP-0007', 'Aluminium Sheet', 2, 15500, 31000],
  ['tol-0003-2', 'to-0003', 'TP-0006', 'Copper Wire 2mm', 5, 3200, 16000],
  ['tol-0004-1', 'to-0004', 'TP-0009', 'Sensor Module', 1, 420000, 420000],
];

export async function seedTestingModels(bridge: DeviceBridge): Promise<void> {
  const ts = now();

  for (const [id, code, name] of SEED_LOOKUPS) {
    await bridge.db.execute(
      'INSERT OR IGNORE INTO test_lookups (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, code, name, ts, ts]
    );
  }

  for (const [id, code, name, category, price, quantity, isActive, launchedAt, notes] of SEED_PRODUCTS) {
    await bridge.db.execute(
      `INSERT OR IGNORE INTO test_products
         (id, code, name, category, price, quantity, is_active, launched_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, category, price, quantity, isActive, launchedAt, notes, ts, ts]
    );
  }

  for (const [id, reference, status, customer, total, orderedAt, notes] of SEED_ORDERS) {
    await bridge.db.execute(
      `INSERT OR IGNORE INTO test_orders
         (id, reference, status, customer_name, total, ordered_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, reference, status, customer, total, orderedAt, notes, ts, ts]
    );
  }

  for (const [id, orderId, sku, description, quantity, unitPrice, lineTotal] of SEED_LINES) {
    await bridge.db.execute(
      `INSERT OR IGNORE INTO test_order_lines
         (id, order_id, sku, description, quantity, unit_price, line_total, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, orderId, sku, description, quantity, unitPrice, lineTotal, ts, ts]
    );
  }

  await seedTestIntegrations(bridge, ts);
}

/**
 * Create an `integration_entities` row (+ full field maps) for each test model so
 * the fixtures appear as configured integrations (Integrations page) and can be
 * synced by the engine. Idempotent on `entity_type` (unique). Rows start disabled
 * with a placeholder base_url — point them at a real endpoint + enable to sync.
 */
export async function seedTestIntegrations(bridge: DeviceBridge, ts = now()): Promise<void> {
  for (const model of listTestModels()) {
    const entityId = `int-${model.id}`;
    await bridge.db.execute(
      `INSERT OR IGNORE INTO integration_entities
         (id, entity_type, name, type, status, base_url, endpoint, sync_direction, schedule, page_size, enabled, created_at, updated_at)
       VALUES (?, ?, ?, 'rest', 'idle', ?, ?, 'push', '30s', 100, 0, ?, ?)`,
      [entityId, model.id, model.label, TEST_INTEGRATION_BASE, `/${model.id}`, ts, ts]
    );

    // Full field mapping: one row per model field (local column -> external field).
    for (const f of model.fields) {
      await bridge.db.execute(
        `INSERT OR IGNORE INTO integration_field_maps
           (id, integration_entity_id, entity_type, source_field, target_field, direction, transform, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'push', NULL, ?, ?)`,
        [`fm-${model.id}-${f.name}`, entityId, model.id, f.name, f.name, ts, ts]
      );
    }
  }
}

export async function clearTestingModels(bridge: DeviceBridge): Promise<void> {
  // Respect the order→lines FK: delete children first.
  await bridge.db.execute('DELETE FROM test_order_lines');
  await bridge.db.execute('DELETE FROM test_orders');
  await bridge.db.execute('DELETE FROM test_products');
  await bridge.db.execute('DELETE FROM test_lookups');
}

export async function getTestingCounts(bridge: DeviceBridge): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const model of listTestModels()) {
    const rows = await bridge.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${model.table}`);
    counts[model.id] = rows[0]?.n ?? 0;
  }
  return counts;
}

/** Register the test models as per-entity + Data Hub sync entities. */
export function registerTestSyncEntities(): void {
  for (const model of listTestModels()) {
    registerIntegrationEntity({
      type: model.id,
      table: model.table,
      keys: model.integration.keys,
      deltaColumn: model.integration.deltaColumn,
    });
    if (model.hub) {
      registerHubEntity(model.id, { table: model.table, activeColumn: model.activeColumn });
    }
  }
  registerTestOrderlineSource();
}

/**
 * Register `test_products` as a cloud orderline source so "Run test sync" can
 * push the fixtures through the Google/Supabase/Grist enqueue pipeline offline.
 */
export function registerTestOrderlineSource(): void {
  registerOrderlineSource({
    type: 'test_products',
    async fetchUnsynced(bridge, options) {
      const limit = options?.limit ?? 200;
      const rows = await bridge.db.query<Record<string, unknown>>(
        'SELECT * FROM test_products ORDER BY code ASC LIMIT ?',
        [limit]
      );
      return rows.map((r) => ({
        id: String(r.id),
        order_id: String(r.code),
        code: r.code,
        name: r.name,
        category: r.category,
        price: r.price,
        quantity: r.quantity,
        is_active: r.is_active,
        launched_at: r.launched_at,
        notes: r.notes,
      }));
    },
  });
}
