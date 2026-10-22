'use client';

// Sync engine: activation + connection management for the WEHA ERP, plus the
// primary sync loop. As of the integration adoption, the loop delegates to the
// per-entity model (src/integration/per-entity-engine) — entities are configured
// in integration_entities + integration_field_maps and registered via
// registerIntegrationEntity(). The legacy outbox drain is kept behind
// `useLegacyOutbox` for apps that still enqueue changes directly.

import type { DeviceBridge } from '@/platform';
import { DeviceClient } from './device-client';
import { getOutboxStats, getPendingItems, markOutboxStatus, type OutboxItem } from './outbox';
import { getApplier } from './registry';
import { useSyncStore } from './sync-store';
import { PerEntitySyncEngine } from '@/integration/per-entity-engine';

export interface SyncEngineConfig {
  baseUrl: string;
  pollIntervalMs: number;
}

interface IntegrationRow {
  id: string;
  name: string;
  kind: string;
  config: string;
  device_token: string | null;
  status: string;
}

interface DefinitionRow {
  id: string;
  entity_type: string;
  direction: string;
  config: string;
  enabled: number;
  last_synced_at: string | null;
}

export interface SyncDefinitionInput {
  entityType: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  configCode: string;
  direction_?: never;
  params?: Record<string, unknown>;
  priority?: number;
}

function now(): string {
  return new Date().toISOString();
}

export class SyncEngine {
  private client: DeviceClient | null = null;
  private integration: IntegrationRow | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private perEntity: PerEntitySyncEngine | null = null;

  constructor(
    private bridge: DeviceBridge,
    private config: SyncEngineConfig
  ) {}

  async load(): Promise<void> {
    const rows = await this.bridge.db.query<IntegrationRow>(
      "SELECT * FROM integrations WHERE kind = 'erp' LIMIT 1"
    );

    if (rows.length === 0) {
      await this.bridge.db.execute(
        `INSERT INTO integrations (id, name, kind, config, status, created_at, updated_at)
         VALUES ('erp', 'WEHA ERP', 'erp', ?, 'inactive', ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [JSON.stringify({ baseUrl: this.config.baseUrl, tenantSlug: '' }), now(), now()]
      );
      const fresh = await this.bridge.db.query<IntegrationRow>(
        "SELECT * FROM integrations WHERE kind = 'erp' LIMIT 1"
      );
      this.integration = fresh[0];
    } else {
      this.integration = rows[0];
    }

    const cfg = JSON.parse(this.integration.config) as { baseUrl?: string; tenantSlug?: string; deviceCode?: string };
    this.client = new DeviceClient(cfg.baseUrl || this.config.baseUrl, cfg.tenantSlug ?? '');
    this.client.setToken(this.integration.device_token);

    this.perEntity = new PerEntitySyncEngine(this.bridge, { pollIntervalMs: this.config.pollIntervalMs });

    useSyncStore.getState().set({
      activated: !!this.integration.device_token,
      deviceCode: cfg.deviceCode ?? null,
      tenantSlug: cfg.tenantSlug ?? null,
    });
  }

  async activate(activationToken: string): Promise<void> {
    if (!this.client || !this.integration) throw new Error('Sync engine not loaded');
    const result = await this.client.activate(activationToken);
    const cfg = JSON.parse(this.integration.config) as Record<string, unknown>;
    const deviceCode = (result.device?.deviceCode as string | undefined) ?? null;
    const merged = { ...cfg, deviceCode, tenantId: result.tenantId };

    await this.bridge.db.execute(
      "UPDATE integrations SET device_token = ?, status = 'active', config = ?, updated_at = ? WHERE id = ?",
      [result.deviceToken, JSON.stringify(merged), now(), this.integration.id]
    );
    await this.bridge.db.execute(
      "INSERT INTO device_settings (key, value, updated_at) VALUES ('device.activated', 'true', ?) ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = excluded.updated_at",
      [now()]
    );

    this.integration = { ...this.integration, device_token: result.deviceToken, config: JSON.stringify(merged), status: 'active' };
    this.client.setToken(result.deviceToken);
    const tenantSlug = (merged.tenantId as string) ?? '';
    this.client.setTenant(tenantSlug);

    useSyncStore.getState().set({ activated: true, deviceCode, tenantSlug });
  }

  async testConnection(): Promise<{ success: boolean; durationMs: number; error?: string }> {
    if (!this.client) throw new Error('Sync engine not loaded');
    const result = await this.client.testConnection();
    useSyncStore.getState().set({ erpReachable: result.success, lastError: result.error ?? null });
    return result;
  }

  async registerDefinition(input: {
    entityType: string;
    direction: 'inbound' | 'outbound';
    configCode: string;
    params?: Record<string, unknown>;
  }): Promise<void> {
    const config = JSON.stringify({ configCode: input.params ? { ...input.params } : undefined });
    const existing = await this.bridge.db.query<{ id: string }>(
      'SELECT id FROM sync_definitions WHERE integration_id = ? AND entity_type = ? AND direction = ?',
      ['erp', input.entityType, input.direction]
    );
    if (existing.length > 0) {
      await this.bridge.db.execute('UPDATE sync_definitions SET config = ?, enabled = 1, updated_at = ? WHERE id = ?', [
        config,
        now(),
        existing[0].id,
      ]);
    } else {
      await this.bridge.db.execute(
        `INSERT INTO sync_definitions (id, integration_id, entity_type, direction, config, created_at, updated_at)
         VALUES (?, 'erp', ?, ?, ?, ?, ?)`,
        [`sd_${input.direction[0]}_${input.entityType}`, input.entityType, input.direction, config, now(), now()]
      );
    }
  }

  async runNow(): Promise<void> {
    await this.tick();
  }

  start(): void {
    if (this.timer) return;
    // Primary loop: the per-entity engine (honors per-entity schedules).
    this.perEntity?.start();
    // Legacy outbox drain (event-driven pushes via enqueueSync) runs alongside.
    this.timer = setInterval(() => void this.tick(), this.config.pollIntervalMs);
  }

  stop(): void {
    this.perEntity?.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Access the per-entity engine (e.g. for a settings "sync now"). */
  get perEntityEngine(): PerEntitySyncEngine | null {
    return this.perEntity;
  }

  private async loadDefinitions(direction: string): Promise<DefinitionRow[]> {
    return this.bridge.db.query<DefinitionRow>(
      "SELECT id, entity_type, direction, config, enabled, last_synced_at FROM sync_definitions WHERE integration_id = 'erp' AND enabled = 1 AND (direction = ? OR direction = 'bidirectional') ORDER BY priority ASC",
      [direction]
    );
  }

  private async logSync(
    direction: string,
    entityType: string | null,
    status: 'success' | 'error',
    message: string
  ): Promise<void> {
    await this.bridge.db.execute(
      'INSERT INTO sync_log (integration_id, entity_type, direction, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['erp', entityType, direction, status, message, now()]
    );
  }

  private async push(item: OutboxItem, def: DefinitionRow): Promise<void> {
    if (!this.client) throw new Error('Not activated');
    const cfg = JSON.parse(def.config) as { configCode?: string };
    const configCode = cfg.configCode ?? item.entity_type.toUpperCase();
    const payload = item.payload ? (JSON.parse(item.payload) as Record<string, unknown>) : {};

    switch (item.action) {
      case 'create':
        await this.client.post(configCode, payload);
        break;
      case 'update':
        await this.client.put(configCode, item.entity_id, payload);
        break;
      case 'delete':
        await this.client.delete(configCode, item.entity_id);
        break;
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    if (!this.client || !this.integration?.device_token) return;
    this.ticking = true;
    const store = useSyncStore.getState();
    store.set({ running: true });

    try {
      // Primary: per-entity sync (field-mapped pull/push against integration_entities).
      if (this.perEntity) {
        await this.perEntity.runNow();
      }

      // Event-driven outbox drain (enqueueSync → push). Independent of per-entity.
      await this.legacyOutboxTick();

      const deviceCode = useSyncStore.getState().deviceCode;
      if (deviceCode) void this.client.heartbeat(deviceCode);

      store.set({ lastRunAt: now(), running: false, erpReachable: true, lastError: null });
    } catch (err) {
      store.set({
        running: false,
        erpReachable: false,
        lastError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.ticking = false;
    }
  }

  private async legacyOutboxTick(): Promise<void> {
    if (!this.client) throw new Error('Not activated');
    const store = useSyncStore.getState();

    // Push: drain the outbox
    const outboundDefs = await this.loadDefinitions('outbound');
    const items = await getPendingItems(this.bridge);
    for (const item of items) {
      const def = outboundDefs.find((d) => d.entity_type === item.entity_type);
      if (!def) {
        await markOutboxStatus(this.bridge, item.id, 'failed', `No outbound sync definition for ${item.entity_type}`);
        continue;
      }
      await markOutboxStatus(this.bridge, item.id, 'processing');
      try {
        await this.push(item, def);
        await markOutboxStatus(this.bridge, item.id, 'done');
        await this.logSync('outbound', item.entity_type, 'success', `${item.action} ${item.entity_id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markOutboxStatus(this.bridge, item.id, 'failed', message);
        await this.logSync('outbound', item.entity_type, 'error', message);
      }
    }

    // Pull: inbound definitions applied via registered appliers
    const inboundDefs = await this.loadDefinitions('inbound');
    for (const def of inboundDefs) {
      const applier = getApplier(def.entity_type);
      if (!applier) continue;
      const cfg = JSON.parse(def.config) as { configCode?: string; params?: Record<string, unknown> };
      try {
        const res = await this.client.get(def.entity_type.toUpperCase(), cfg.params);
        await applier(this.bridge, (res.data?.items ?? []) as Record<string, unknown>[]);
        await this.bridge.db.execute('UPDATE sync_definitions SET last_synced_at = ?, updated_at = ? WHERE id = ?', [
          now(),
          now(),
          def.id,
        ]);
        await this.logSync('inbound', def.entity_type, 'success', `pulled ${(res.data?.items ?? []).length} items`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.logSync('inbound', def.entity_type, 'error', message);
      }
    }

    const stats = await getOutboxStats(this.bridge);
    store.set({ stats });
  }
}
