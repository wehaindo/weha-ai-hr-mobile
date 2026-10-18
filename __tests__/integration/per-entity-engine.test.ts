// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { PerEntitySyncEngine, parseScheduleSeconds, IntegrationService } from '@/integration/per-entity-engine';
import { registerIntegrationEntity, clearIntegrationEntities } from '@/integration/entities';
import { clearTableMetaCache } from '@/integration/pos-sync';

describe('parseScheduleSeconds', () => {
  it('parses second/minute/hour/day units', () => {
    expect(parseScheduleSeconds('30s')).toBe(30);
    expect(parseScheduleSeconds('5m')).toBe(300);
    expect(parseScheduleSeconds('2h')).toBe(7200);
    expect(parseScheduleSeconds('1d')).toBe(86400);
  });

  it('defaults to 30 for blank/invalid', () => {
    expect(parseScheduleSeconds('')).toBe(30);
    expect(parseScheduleSeconds(null)).toBe(30);
    expect(parseScheduleSeconds('abc')).toBe(30);
  });

  it('treats a bare number as seconds', () => {
    expect(parseScheduleSeconds('45')).toBe(45);
  });
});

describe('IntegrationService CRUD', () => {
  let handle: FakeBridgeHandle;
  let service: IntegrationService;

  beforeEach(async () => {
    handle = await createFakeBridge();
    service = new IntegrationService(handle.bridge);
  });

  it('creates and lists an entity', async () => {
    await service.createEntity({ entity_type: 'widgets', name: 'Widgets', base_url: 'https://x', endpoint: '/w' });
    const entities = await service.listEntities();
    expect(entities).toHaveLength(1);
    expect(entities[0].entity_type).toBe('widgets');
    expect(entities[0].sync_direction).toBe('pull');
    expect(entities[0].page_size).toBe(100);
    expect(entities[0].enabled).toBe(1);
  });

  it('updates an entity and its enabled flag', async () => {
    const e = await service.createEntity({ entity_type: 'widgets', name: 'W', base_url: 'https://x', endpoint: '/w' });
    await service.updateEntity(e.id, { schedule: '5m', enabled: false });
    const updated = await service.getEntity(e.id);
    expect(updated?.schedule).toBe('5m');
    expect(updated?.enabled).toBe(0);
  });

  it('creates and lists field maps, and cascades on entity delete', async () => {
    const e = await service.createEntity({ entity_type: 'widgets', name: 'W', base_url: 'https://x', endpoint: '/w' });
    await service.createFieldMap(e.id, 'widgets', { source_field: 'name', target_field: 'title' });
    expect(await service.listFieldMaps(e.id)).toHaveLength(1);

    await service.deleteEntity(e.id);
    expect(await service.listFieldMaps(e.id)).toHaveLength(0);
  });
});

describe('PerEntitySyncEngine', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearIntegrationEntities();
    clearTableMetaCache();
    handle.engine.execute(`CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT, sku TEXT, created_at TEXT, updated_at TEXT)`);
    registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['sku'] });
  });

  function insertEntity(): string {
    const id = 'entity1';
    const now = new Date().toISOString();
    handle.engine.execute(
      `INSERT INTO integration_entities (id, entity_type, name, type, status, base_url, api_key, endpoint, sync_direction, schedule, page_size, enabled, created_at, updated_at)
       VALUES (?, 'widgets', 'Widgets', 'rest', 'idle', 'https://api.example.com', NULL, '/w', 'pull', '0s', 100, 1, ?, ?)`,
      [id, now, now]
    );
    return id;
  }

  it('runs a due entity, pulls a row, and records success + sync_log', async () => {
    const id = insertEntity();
    // Register a field map so the pull actually maps + inserts.
    await handle.bridge.db.execute(
      `INSERT INTO integration_field_maps (id, integration_entity_id, entity_type, source_field, target_field, direction, created_at, updated_at)
       VALUES ('fm1', ?, 'widgets', 'name', 'name', 'both', ?, ?)`,
      [id, new Date().toISOString(), new Date().toISOString()]
    );
    await handle.bridge.db.execute(
      `INSERT INTO integration_field_maps (id, integration_entity_id, entity_type, source_field, target_field, direction, created_at, updated_at)
       VALUES ('fm2', ?, 'widgets', 'sku', 'sku', 'both', ?, ?)`,
      [id, new Date().toISOString(), new Date().toISOString()]
    );

    const engine = new PerEntitySyncEngine(handle.bridge, {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => [{ sku: 'A1', name: 'Alpha' }] }) as unknown as Response,
    });

    const result = await engine.runNow();
    expect(result.errors).toBe(0);
    expect(result.synced).toBe(1);

    const entity = await handle.bridge.db.query<{ last_status: string; last_error: string | null }>('SELECT last_status, last_error FROM integration_entities WHERE id = ?', [id]);
    expect(entity[0].last_error).toBeNull();

    const rows = await handle.bridge.db.query<{ name: string }>('SELECT name FROM widgets');
    expect(rows[0].name).toBe('Alpha');

    const logs = await handle.bridge.db.query<{ status: string }>("SELECT status FROM sync_log WHERE entity_type = 'widgets'");
    expect(logs.length).toBeGreaterThan(0);
  });

  it('gates re-runs by schedule (a second run within the window is skipped)', async () => {
    insertEntity();
    // Schedule far in the future — the FIRST run still fires (never run before),
    // but an immediate second run must be skipped.
    await handle.bridge.db.execute("UPDATE integration_entities SET schedule = '1d' WHERE id = 'entity1'");
    const engine = new PerEntitySyncEngine(handle.bridge, {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response,
    });

    const first = await engine.runNow();
    expect(first.synced).toBe(1);

    const second = await engine.runNow();
    expect(second.synced).toBe(0);
    expect(second.errors).toBe(0);
  });

  it('records an error when the fetch fails', async () => {
    const id = insertEntity();
    const engine = new PerEntitySyncEngine(handle.bridge, {
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
    });
    const result = await engine.runNow();
    expect(result.errors).toBe(1);
    const entity = await handle.bridge.db.query<{ last_status: string }>('SELECT last_status FROM integration_entities WHERE id = ?', [id]);
    expect(entity[0].last_status).toBe('error');
  });
});
