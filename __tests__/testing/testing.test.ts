// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { seedTestingModels, clearTestingModels, getTestingCounts, registerTestSyncEntities } from '@/testing/seed';
import { listTestModels, getTestModel } from '@/testing/registry';
import { formatMinor } from '@/testing/models';
import { clearIntegrationEntities, listIntegrationEntityTypes } from '@/integration/entities';
import { clearHubEntities, listHubEntityTypes } from '@/integration/hub-entities';
import { clearOrderlineSources, getOrderlineSource } from '@/integration/orderline-source';
import { enqueueOrderlineJobs } from '@/integration/cloud/enqueue';

describe('testing models', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearIntegrationEntities();
    clearHubEntities();
    clearOrderlineSources();
  });

  it('exposes the four models with fields, columns and sync config', () => {
    expect(listTestModels().map((m) => m.id).sort()).toEqual(['test_lookups', 'test_order_lines', 'test_orders', 'test_products']);
    const product = getTestModel('test_products');
    expect(product).not.toBeNull();
    expect(product!.integration.keys).toEqual(['code']);
    expect(product!.fields.some((f) => f.name === 'category' && f.type === 'combobox')).toBe(true);
    expect(product!.columns.some((c) => c.render === 'money')).toBe(true);
  });

  it('formats minor-unit money for display', () => {
    expect(formatMinor(250000)).toBe('250,000');
    expect(formatMinor(null)).toBe('0');
  });

  it('seeds the fixture counts and is idempotent', async () => {
    await seedTestingModels(handle.bridge);
    let counts = await getTestingCounts(handle.bridge);
    expect(counts).toEqual({ test_products: 10, test_orders: 4, test_order_lines: 6, test_lookups: 4 });

    // Re-run: no duplicates.
    await seedTestingModels(handle.bridge);
    counts = await getTestingCounts(handle.bridge);
    expect(counts).toEqual({ test_products: 10, test_orders: 4, test_order_lines: 6, test_lookups: 4 });
  });

  it('clears all fixture rows', async () => {
    await seedTestingModels(handle.bridge);
    await clearTestingModels(handle.bridge);
    const counts = await getTestingCounts(handle.bridge);
    expect(counts).toEqual({ test_products: 0, test_orders: 0, test_order_lines: 0, test_lookups: 0 });
  });

  it('creates an integration_entities row per model (idempotent, disabled by default)', async () => {
    await seedTestingModels(handle.bridge);
    await seedTestingModels(handle.bridge); // re-run: no duplicates

    const rows = await handle.bridge.db.query<{ entity_type: string; base_url: string; endpoint: string; enabled: number }>(
      'SELECT * FROM integration_entities ORDER BY entity_type ASC'
    );
    expect(rows.map((r) => r.entity_type)).toEqual(['test_lookups', 'test_order_lines', 'test_orders', 'test_products']);
    expect(rows[0].base_url).toBe('http://localhost:3178');
    expect(rows[0].endpoint).toBe('/test_lookups');
    expect(rows[0].enabled).toBe(0);

    // Full field maps: one per field across the four models (8+6+6+2 = 22).
    const maps = await handle.bridge.db.query<{ entity_type: string; source_field: string; target_field: string; direction: string }>(
      'SELECT * FROM integration_field_maps'
    );
    expect(maps).toHaveLength(22);
    expect(maps.filter((m) => m.entity_type === 'test_products').map((m) => m.source_field)).toContain('category');
    expect(maps.every((m) => m.source_field === m.target_field && m.direction === 'push')).toBe(true);
  });

  it('registers the models as integration + hub entities and an orderline source', () => {
    registerTestSyncEntities();
    const entities = listIntegrationEntityTypes();
    for (const id of ['test_products', 'test_orders', 'test_order_lines', 'test_lookups']) {
      expect(entities).toContain(id);
      expect(listHubEntityTypes()).toContain(id);
    }
    expect(getOrderlineSource('test_products')).not.toBeNull();
  });

  it('enqueues test_products to Supabase via the orderline source (idempotent)', async () => {
    await seedTestingModels(handle.bridge);
    registerTestSyncEntities();

    const ts = new Date().toISOString();
    await handle.bridge.db.execute(
      `INSERT INTO supabase_configs (id, name, supabase_url, created_at, updated_at) VALUES ('cfg1', 'Test', 'https://x.supabase.co', ?, ?)`,
      [ts, ts]
    );

    const first = await enqueueOrderlineJobs(handle.bridge, 'supabase', { sourceType: 'test_products' });
    expect(first.error).toBeUndefined();
    expect(first.enqueued).toBe(10);

    // Second run is idempotent on sync_id: all skipped.
    const second = await enqueueOrderlineJobs(handle.bridge, 'supabase', { sourceType: 'test_products' });
    expect(second.enqueued).toBe(0);
    expect(second.skipped).toBe(10);

    const jobs = await handle.bridge.db.query<{ id: string }>('SELECT id FROM supabase_sync_jobs');
    expect(jobs).toHaveLength(10);
  });
});
