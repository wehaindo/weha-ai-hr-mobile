// @vitest-environment node
// Device-auth integrations: auth_type='device' → the framework external API
// `/api/device/{configCode}` using the activated device token + tenant.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import {
  runEntitySync,
  clearTableMetaCache,
  type IntegrationEntityRow,
  type IntegrationFieldMapRow,
} from '@/integration/pos-sync';
import { registerIntegrationEntity, clearIntegrationEntities } from '@/integration/entities';
import deviceConfig from '@/device.config';
import type { DeviceBridge } from '@/platform';

function deviceEntity(overrides: Partial<IntegrationEntityRow> = {}): IntegrationEntityRow {
  return {
    id: 'e1',
    entity_type: 'widgets',
    name: 'Widgets',
    type: 'rest',
    status: 'idle',
    base_url: '', // unused for device auth
    api_key: null,
    sync_source: 'device',
    endpoint: 'PRODUCT', // configCode
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

function fieldMaps(): IntegrationFieldMapRow[] {
  return [
    { id: 'fm1', integration_entity_id: 'e1', entity_type: 'widgets', source_field: 'sku', target_field: 'sku', direction: 'both', transform: null },
    { id: 'fm2', integration_entity_id: 'e1', entity_type: 'widgets', source_field: 'name', target_field: 'name', direction: 'both', transform: null },
  ];
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/** Seed an activated device (token + tenant in the erp integration row). */
async function activateDevice(
  bridge: DeviceBridge,
  token = 'dev_live_secret',
  tenantId = 'tenant-abc'
): Promise<void> {
  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO integrations (id, name, kind, config, status, device_token, created_at, updated_at)
     VALUES ('erp', 'WEHA ERP', 'erp', ?, 'active', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET device_token = excluded.device_token, config = excluded.config`,
    [JSON.stringify({ tenantId }), token, now, now]
  );
}

describe('device-auth integration sync', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
    clearIntegrationEntities();
    clearTableMetaCache();
    handle.engine.execute(
      `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT, sku TEXT, price INTEGER, created_at TEXT, updated_at TEXT)`
    );
    registerIntegrationEntity({ type: 'widgets', table: 'widgets', keys: ['sku'] });
  });

  it('calls the backend external API with Bearer token + tenantId', async () => {
    await activateDevice(handle.bridge, 'dev_live_secret', 'tenant-abc');

    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ data: { items: [{ sku: 'A1', name: 'Alpha' }], total: 1 } });
    };

    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: deviceEntity(),
      fieldMaps: fieldMaps(),
      fetchImpl,
    });

    // URL: {erpBase}/api/device/{configCode} with pagination + tenant
    const u = new URL(capturedUrl);
    expect(`${u.origin}${u.pathname}`).toBe(`${deviceConfig.erp.baseUrl}/api/device/PRODUCT`);
    expect(u.searchParams.get('tenantId')).toBe('tenant-abc');
    expect(u.searchParams.get('limit')).toBe('100');
    expect(u.searchParams.get('offset')).toBe('0');

    // Auth header: the device token
    const headers = (capturedInit?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer dev_live_secret');

    // The pull still upserts locally
    expect(result.pulled).toBe(1);
    expect(result.errors).toEqual([]);
    const rows = await handle.bridge.db.query<{ name: string }>('SELECT name FROM widgets');
    expect(rows[0].name).toBe('Alpha');
  });

  it('skips with a clear error when the device is not activated', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { items: [], total: 0 } }));

    const result = await runEntitySync({
      bridge: handle.bridge,
      entity: deviceEntity(),
      fieldMaps: fieldMaps(),
      fetchImpl,
    });

    expect(result.pulled).toBe(0);
    expect(result.errors[0]).toMatch(/not activated/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
