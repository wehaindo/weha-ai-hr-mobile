// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { applyEvent } from '@/integration/datahub/apply';
import { registerHubEntity, clearHubEntities, aliasHubEntity } from '@/integration/hub-entities';
import type { SyncEvent } from '@/integration/datahub/client';

function event(overrides: Partial<SyncEvent>): SyncEvent {
  return {
    event_id: 'evt1',
    seq: 1,
    entity_type: 'widgets',
    entity_id: 'w1',
    action: 'create',
    version: 1,
    payload: {},
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createWidgetsTable(handle: FakeBridgeHandle): void {
  handle.engine.execute(
    `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT, price INTEGER, is_active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT)`
  );
}

describe('datahub applyEvent', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearHubEntities();
    createWidgetsTable(handle);
    registerHubEntity('widgets', { table: 'widgets', activeColumn: 'is_active' });
  });

  it('creates a row (INSERT OR REPLACE) and strips hub-only columns', async () => {
    const result = await applyEvent(
      handle.bridge,
      event({ action: 'create', entity_id: 'w1', payload: { id: 'w1', name: 'Alpha', price: 1, tenant_id: 't', version: 9, updated_at: 'x' } })
    );
    expect(result.status).toBe('applied');
    expect(result.local_id).toBe('w1');

    const rows = await handle.bridge.db.query<{ name: string }>('SELECT name FROM widgets WHERE id = ?', ['w1']);
    expect(rows[0].name).toBe('Alpha');
  });

  it('updates an existing row by local id', async () => {
    handle.engine.execute(`INSERT INTO widgets (id, name, price) VALUES ('w1', 'Old', 1)`);
    const result = await applyEvent(handle.bridge, event({ action: 'update', entity_id: 'w1', payload: { name: 'New' } }));
    expect(result.status).toBe('applied');
    const rows = await handle.bridge.db.query<{ name: string }>('SELECT name FROM widgets WHERE id = ?', ['w1']);
    expect(rows[0].name).toBe('New');
  });

  it('soft-deletes via the active column when configured', async () => {
    handle.engine.execute(`INSERT INTO widgets (id, name, is_active) VALUES ('w1', 'Alpha', 1)`);
    const result = await applyEvent(handle.bridge, event({ action: 'delete', entity_id: 'w1' }));
    expect(result.status).toBe('applied');
    const rows = await handle.bridge.db.query<{ is_active: number }>('SELECT is_active FROM widgets WHERE id = ?', ['w1']);
    expect(rows[0].is_active).toBe(0);
  });

  it('hard-deletes when no active column is configured', async () => {
    registerHubEntity('widgets', { table: 'widgets' });
    handle.engine.execute(`INSERT INTO widgets (id, name) VALUES ('w1', 'Alpha')`);
    const result = await applyEvent(handle.bridge, event({ action: 'delete', entity_id: 'w1' }));
    expect(result.status).toBe('applied');
    const rows = await handle.bridge.db.query('SELECT id FROM widgets WHERE id = ?', ['w1']);
    expect(rows).toHaveLength(0);
  });

  it('resolves aliases to the canonical entity type', async () => {
    aliasHubEntity('widget', 'widgets');
    const result = await applyEvent(handle.bridge, event({ action: 'create', entity_type: 'widget', entity_id: 'w1', payload: { id: 'w1', name: 'Aliased' } }));
    expect(result.status).toBe('applied');
    const rows = await handle.bridge.db.query<{ name: string }>('SELECT name FROM widgets WHERE id = ?', ['w1']);
    expect(rows[0].name).toBe('Aliased');
  });

  it('skips unknown entity types', async () => {
    const result = await applyEvent(handle.bridge, event({ action: 'create', entity_type: 'unknown', entity_id: 'x' }));
    expect(result.status).toBe('skipped');
  });

  it('skips events with no entity_id', async () => {
    const result = await applyEvent(handle.bridge, event({ action: 'create', entity_id: null, payload: {} }));
    expect(result.status).toBe('skipped');
  });
});
