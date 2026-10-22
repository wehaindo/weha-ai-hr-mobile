// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import {
  runEntitySync,
  mapPull,
  mapPush,
  parseItems,
  buildUrl,
  authHeader,
  clearTableMetaCache,
  type IntegrationEntityRow,
  type IntegrationFieldMapRow,
} from '@/integration/pos-sync';
import { registerIntegrationEntity, clearIntegrationEntities } from '@/integration/entities';

function entity(overrides: Partial<IntegrationEntityRow>): IntegrationEntityRow {
  return {
    id: 'e1',
    entity_type: 'widgets',
    name: 'Widgets',
    type: 'rest',
    status: 'idle',
    base_url: 'https://api.example.com',
    api_key: 'secret',
    endpoint: '/v1/widgets',
    sync_direction: 'pull',
    schedule: '30s',
    page_size: 100,
    enabled: 1,
    last_run_at: null,
    next_run_at: null,
    last_status: null,
    last_error: null,
    push_cursor: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function fieldMaps(maps: Array<Partial<IntegrationFieldMapRow>>): IntegrationFieldMapRow[] {
  return maps.map((m, i) => ({
    id: `fm${i}`,
    integration_entity_id: 'e1',
    entity_type: 'widgets',
    source_field: m.source_field ?? 'name',
    target_field: m.target_field ?? 'name',
    direction: m.direction ?? 'both',
    transform: m.transform ?? null,
  }));
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function createWidgetsTable(handle: FakeBridgeHandle): void {
  handle.engine.execute(
    `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT, sku TEXT, price INTEGER, created_at TEXT, updated_at TEXT)`
  );
}

describe('pos-sync pure helpers', () => {
  it('maps pull records via target→source', () => {
    const out = mapPull({ name: 'Sprocket' }, fieldMaps([{ source_field: 'name', target_field: 'name' }]));
    expect(out).toEqual({ name: 'Sprocket' });
  });

  it('maps push rows via source→target', () => {
    const out = mapPush({ name: 'Sprocket' }, fieldMaps([{ source_field: 'name', target_field: 'title' }]));
    expect(out).toEqual({ title: 'Sprocket' });
  });

  it('normalizes list envelopes', () => {
    expect(parseItems([1, 2])).toEqual([1, 2]);
    expect(parseItems({ data: { items: [1] } })).toEqual([1]);
    expect(parseItems({ data: [2] })).toEqual([2]);
    expect(parseItems({ records: [3] })).toEqual([3]);
    expect(parseItems({})).toEqual([]);
  });

  it('builds a URL from base + endpoint', () => {
    expect(buildUrl('https://api.example.com', '/v1/widgets')).toBe('https://api.example.com/v1/widgets');
    expect(buildUrl('https://api.example.com/', 'v1/widgets')).toBe('https://api.example.com/v1/widgets');
    expect(() => buildUrl('', '/x')).toThrow('Base URL is not configured');
  });

  it('normalizes the auth header', () => {
    expect(authHeader('secret')).toBe('Bearer secret');
    expect(authHeader('Bearer secret')).toBe('Bearer secret');
    expect(authHeader('')).toBeNull();
    expect(authHeader(null)).toBeNull();
  });
});

describe('runEntitySync — pull', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearIntegrationEntities();
    clearTableMetaCache();
    createWidgetsTable(handle);
    registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['sku'] });
  });

  it('pulls records and inserts by natural key', async () => {
    const fetchImpl = async () => jsonResponse([{ sku: 'A1', name: 'Alpha', price: 100 }]);
    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({}),
      fieldMaps: fieldMaps([
        { source_field: 'sku', target_field: 'sku' },
        { source_field: 'name', target_field: 'name' },
        { source_field: 'price', target_field: 'price' },
      ]),
      fetchImpl,
    });

    expect(result.pulled).toBe(1);
    expect(result.errors).toEqual([]);
    const rows = await handle.bridge.db.query<{ name: string }>('SELECT name FROM widgets');
    expect(rows[0].name).toBe('Alpha');
  });

  it('updates an existing row when the natural key matches', async () => {
    handle.engine.execute(`INSERT INTO widgets (id, name, sku, price) VALUES ('w1', 'Old', 'A1', 1)`);
    const fetchImpl = async () => jsonResponse([{ sku: 'A1', name: 'New', price: 200 }]);
    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({}),
      fieldMaps: fieldMaps([
        { source_field: 'sku', target_field: 'sku' },
        { source_field: 'name', target_field: 'name' },
      ]),
      fetchImpl,
    });

    expect(result.pulled).toBe(1);
    const rows = await handle.bridge.db.query<{ name: string }>('SELECT name FROM widgets');
    expect(rows[0].name).toBe('New');
    expect(rows).toHaveLength(1);
  });

  it('reports an error when the natural key is missing', async () => {
    const fetchImpl = async () => jsonResponse([{ name: 'NoSku' }]);
    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({}),
      fieldMaps: fieldMaps([{ source_field: 'name', target_field: 'name' }]),
      fetchImpl,
    });
    expect(result.errors.some((e) => e.includes('missing natural key'))).toBe(true);
  });

  it('pages through results until exhausted', async () => {
    let call = 0;
    const fetchImpl = async (url: string) => {
      call++;
      const offset = Number(new URL(url).searchParams.get('offset'));
      if (offset === 0) return jsonResponse({ data: { items: [{ sku: 'A1', name: 'A' }], total: 2 } });
      return jsonResponse({ data: { items: [{ sku: 'B1', name: 'B' }], total: 2 } });
    };
    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({}),
      fieldMaps: fieldMaps([
        { source_field: 'sku', target_field: 'sku' },
        { source_field: 'name', target_field: 'name' },
      ]),
      fetchImpl,
    });
    expect(result.pulled).toBe(2);
    expect(call).toBe(2);
  });

  it('records an HTTP error on the first page', async () => {
    const fetchImpl = async () => jsonResponse({}, false, 500);
    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({}),
      fieldMaps: fieldMaps([]),
      fetchImpl,
    });
    expect(result.errors[0]).toContain('HTTP 500');
  });
});

describe('runEntitySync — push', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearIntegrationEntities();
    clearTableMetaCache();
    createWidgetsTable(handle);
    registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['sku'] });
  });

  it('pushes rows and attaches an idempotency key when configured', async () => {
    handle.engine.execute(`INSERT INTO widgets (id, name, sku, price) VALUES ('w1', 'Alpha', 'A1', 100)`);
    registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['sku'], idempotency: true });

    let body: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({ ok: true });
    };

    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({ sync_direction: 'push' }),
      fieldMaps: fieldMaps([
        { source_field: 'name', target_field: 'name' },
        { source_field: 'price', target_field: 'price' },
      ]),
      fetchImpl,
    });

    expect(result.pushed).toBe(1);
    expect(body.idempotency_key).toBe('POS-widgets-w1');
    expect(body.name).toBe('Alpha');
  });

  it('advances the push cursor only on a clean run', async () => {
    handle.engine.execute(`INSERT INTO widgets (id, name, sku, price, updated_at) VALUES ('w1', 'Alpha', 'A1', 100, '2024-01-01 00:00:00')`);
    registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['sku'], deltaColumn: 'updated_at' });

    const okFetch = async () => jsonResponse({ ok: true });
    const okResult = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({ sync_direction: 'push', push_cursor: null }),
      fieldMaps: fieldMaps([{ source_field: 'name', target_field: 'name' }]),
      fetchImpl: okFetch,
    });
    expect(okResult.pushCursor).not.toBeNull();

    const failFetch = async () => jsonResponse({}, false, 500);
    const failResult = await runEntitySync({
      bridge: handle.bridge,
      entity: entity({ sync_direction: 'push', push_cursor: null }),
      fieldMaps: fieldMaps([{ source_field: 'name', target_field: 'name' }]),
      fetchImpl: failFetch,
    });
    expect(failResult.pushCursor).toBeNull();
    expect(failResult.errors.length).toBeGreaterThan(0);
  });
});
