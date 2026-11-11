// @vitest-environment node
// Device-sync identity: EMPLOYEES + PORTAL_USERS integrations (the device side
// of weha-framework's `npm run seed:device-sync` configs).
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { seedIdentityIntegrations } from '@/integration/seed';
import { clearIntegrationEntities, getIntegrationEntityDef, registerIntegrationEntity } from '@/integration/entities';

describe('device-sync identity (EMPLOYEES / PORTAL_USERS)', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearIntegrationEntities();
    // as wired at sync boot
    registerIntegrationEntity({ type: 'employees', table: 'employees', keys: ['id'] });
    registerIntegrationEntity({ type: 'portal_users', table: 'portal_users', keys: ['id'] });
  });

  it('registers both entities with their table and `id` natural key', () => {
    expect(getIntegrationEntityDef('employees').table).toBe('employees');
    expect(getIntegrationEntityDef('employees').keys).toEqual(['id']);
    expect(getIntegrationEntityDef('portal_users').table).toBe('portal_users');
    expect(getIntegrationEntityDef('portal_users').keys).toEqual(['id']);
  });

  it('creates the tables (migration 0030)', async () => {
    const cols = await handle.bridge.db.query<{ name: string }>('PRAGMA table_info(employees)');
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['id', 'employee_id', 'device_pin_hash', 'created_at', 'updated_at'])
    );
    const portalCols = await handle.bridge.db.query<{ name: string }>('PRAGMA table_info(portal_users)');
    expect(portalCols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['id', 'email', 'password_hash', 'created_at', 'updated_at'])
    );
  });

  it('seeds both integrations with device auth + field maps, and is idempotent', async () => {
    await seedIdentityIntegrations(handle.bridge);
    await seedIdentityIntegrations(handle.bridge); // re-run: no duplicates

    const rows = await handle.bridge.db.query<{
      entity_type: string;
      sync_source: string;
      endpoint: string;
      enabled: number;
    }>('SELECT entity_type, sync_source, endpoint, enabled FROM integration_entities ORDER BY entity_type');
    expect(rows).toEqual([
      { entity_type: 'employees', sync_source: 'device', endpoint: 'EMPLOYEES', enabled: 1 },
      { entity_type: 'portal_users', sync_source: 'device', endpoint: 'PORTAL_USERS', enabled: 1 },
    ]);

    const maps = await handle.bridge.db.query<{ entity_type: string; source_field: string; target_field: string }>(
      'SELECT entity_type, source_field, target_field FROM integration_field_maps'
    );
    expect(maps.filter((m) => m.entity_type === 'employees')).toHaveLength(13);
    expect(maps.filter((m) => m.entity_type === 'portal_users')).toHaveLength(10);

    // the natural key (id) is mapped, so upserts dedup by source id
    expect(maps.find((m) => m.entity_type === 'employees' && m.source_field === 'id')?.target_field).toBe('id');
    // updatedAt is intentionally NOT mapped — the write path owns updated_at
    expect(maps.find((m) => m.source_field === 'updated_at')).toBeUndefined();
  });
});
