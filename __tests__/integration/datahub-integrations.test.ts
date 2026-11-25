// @vitest-environment node
// Bridge between integration rows and the data hub registry: a row with
// sync_source='datahub' exposes its table to the hub pipeline.
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { registerDatahubIntegrations } from '@/integration/datahub/integrations';
import { clearHubEntities, getHubEntityMapping, registerHubEntity } from '@/integration/hub-entities';
import { clearIntegrationEntities, registerIntegrationEntity } from '@/integration/entities';

async function seedIntegration(
  handle: FakeBridgeHandle,
  entityType: string,
  syncSource: 'device' | 'datahub' | 'api_key'
): Promise<void> {
  const now = new Date().toISOString();
  await handle.bridge.db.execute(
    `INSERT INTO integration_entities (id, entity_type, name, type, status, base_url, api_key, sync_source, endpoint, sync_direction, schedule, page_size, enabled, created_at, updated_at)
     VALUES (?, ?, ?, 'rest', 'idle', '', NULL, ?, '', 'pull', '30s', 100, 1, ?, ?)`,
    [entityType, entityType, entityType, syncSource, now, now]
  );
}

describe('registerDatahubIntegrations', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearHubEntities();
    clearIntegrationEntities();
    registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['sku'] });
  });

  it('registers an enabled datahub row as a hub entity (table from the entity def)', async () => {
    await seedIntegration(handle, 'widgets', 'datahub');

    await registerDatahubIntegrations(handle.bridge);

    expect(getHubEntityMapping('widgets')).toEqual({ table: 'widgets' });
  });

  it('ignores rows that are not datahub-mode', async () => {
    await seedIntegration(handle, 'widgets', 'device');

    await registerDatahubIntegrations(handle.bridge);

    expect(getHubEntityMapping('widgets')).toBeNull();
  });

  it('does not clobber an existing hub mapping (e.g. one with an activeColumn)', async () => {
    registerHubEntity('widgets', { table: 'widgets', activeColumn: 'is_active' });
    await seedIntegration(handle, 'widgets', 'datahub');

    await registerDatahubIntegrations(handle.bridge);

    expect(getHubEntityMapping('widgets')).toEqual({ table: 'widgets', activeColumn: 'is_active' });
  });
});
