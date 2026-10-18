// Per-entity sync engine — the primary ERP sync loop. Reads enabled
// `integration_entities` rows, runs each on its schedule via runEntitySync, and
// tracks last-run status + push cursor. Reuses the `integrations` token row and
// sync_log written by the legacy engine so the /sync monitor keeps working.

import type { DeviceBridge } from '@/platform';
import { runEntitySync, type IntegrationEntityRow, type IntegrationFieldMapRow } from './pos-sync';
import { useSyncStore } from '@/sync/sync-store';

const DEFAULT_POLL_MS = 30_000;

// Parse ai-pos schedule strings: "30s", "5m", "15h", "1d", or plain seconds.
const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
export function parseScheduleSeconds(schedule?: string | null): number {
  const raw = (schedule || '').trim();
  if (!raw) return 30;
  const match = /^(\d+)\s*([smhd])?$/i.exec(raw);
  if (!match) return 30;
  const value = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  return value * (UNITS[unit] ?? 1);
}

// Order entities must sync after their parents (transactions before items/payments).
const SYNC_ORDER_RANK: Record<string, number> = { transactions: 0, transaction_items: 1, payments: 2 };
function rankFor(entityType: string): number {
  return SYNC_ORDER_RANK[entityType] ?? 10;
}

function now(): string {
  return new Date().toISOString();
}

export interface PerEntitySyncConfig {
  pollIntervalMs?: number;
  /** Injected fetch for tests; defaults to global fetch. */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

export class PerEntitySyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inFlight = new Set<string>();
  private lastRunAt = new Map<string, number>();

  constructor(private bridge: DeviceBridge, private config: PerEntitySyncConfig = {}) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.config.pollIntervalMs ?? DEFAULT_POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runNow(): Promise<{ synced: number; errors: number }> {
    return this.tick();
  }

  private async loadEnabled(): Promise<IntegrationEntityRow[]> {
    return this.bridge.db.query<IntegrationEntityRow>(
      'SELECT * FROM integration_entities WHERE enabled = 1 ORDER BY entity_type ASC'
    );
  }

  private async loadFieldMaps(entityId: string): Promise<IntegrationFieldMapRow[]> {
    return this.bridge.db.query<IntegrationFieldMapRow>(
      'SELECT * FROM integration_field_maps WHERE integration_entity_id = ?',
      [entityId]
    );
  }

  private async logSync(entityType: string, status: 'success' | 'error', message: string): Promise<void> {
    await this.bridge.db.execute(
      'INSERT INTO sync_log (integration_id, entity_type, direction, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['erp', entityType, 'integration', status, message, now()]
    );
  }

  private async tick(): Promise<{ synced: number; errors: number }> {
    if (this.running) return { synced: 0, errors: 0 };
    this.running = true;
    const store = useSyncStore.getState();
    store.set({ running: true });

    let synced = 0;
    let errors = 0;

    try {
      const entities = await this.loadEnabled();
      const nowMs = Date.now();

      // Sort by rank so parents (transactions) sync before children (items/payments).
      const ordered = [...entities].sort((a, b) => rankFor(a.entity_type) - rankFor(b.entity_type));

      for (const entity of ordered) {
        if (this.inFlight.has(entity.id)) continue;

        const scheduleMs = parseScheduleSeconds(entity.schedule) * 1000;
        const last = this.lastRunAt.get(entity.id) ?? 0;
        if (nowMs - last < scheduleMs) continue;

        this.inFlight.add(entity.id);
        this.lastRunAt.set(entity.id, nowMs);
        try {
          const fieldMaps = await this.loadFieldMaps(entity.id);
          const result = await runEntitySync({ bridge: this.bridge, entity, fieldMaps, fetchImpl: this.config.fetchImpl });

          const ok = result.errors.length === 0;
          const message = ok
            ? `pulled ${result.pulled}, pushed ${result.pushed}`
            : result.errors.slice(0, 5).join('; ');

          await this.bridge.db.execute(
            `UPDATE integration_entities SET last_run_at = ?, last_status = ?, last_error = ?, push_cursor = COALESCE(?, push_cursor), updated_at = ? WHERE id = ?`,
            [now(), ok ? 'success' : 'error', ok ? null : message, result.pushCursor, now(), entity.id]
          );
          await this.logSync(entity.entity_type, ok ? 'success' : 'error', message);

          if (ok) synced++;
          else errors++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.bridge.db.execute(
            'UPDATE integration_entities SET last_run_at = ?, last_status = ?, last_error = ?, updated_at = ? WHERE id = ?',
            [now(), 'error', message, now(), entity.id]
          );
          await this.logSync(entity.entity_type, 'error', message);
          errors++;
        } finally {
          this.inFlight.delete(entity.id);
        }
      }

      const stats = await this.outboxStats();
      store.set({ stats, lastRunAt: now(), running: false, erpReachable: true, lastError: null });
    } catch (err) {
      store.set({ running: false, erpReachable: false, lastError: err instanceof Error ? err.message : String(err) });
    } finally {
      this.running = false;
    }

    return { synced, errors };
  }

  // Reuse the sync_queue outbox stats for the shared sync indicator.
  private async outboxStats() {
    const rows = await this.bridge.db.query<{ status: string; c: number }>(
      'SELECT status, COUNT(*) AS c FROM sync_queue GROUP BY status'
    );
    const stats = { pending: 0, processing: 0, failed: 0, done: 0, total: 0 };
    for (const row of rows) {
      const n = row.c ?? 0;
      stats.total += n;
      if (row.status === 'pending') stats.pending += n;
      else if (row.status === 'processing') stats.processing += n;
      else if (row.status === 'failed') stats.failed += n;
      else if (row.status === 'done') stats.done += n;
    }
    return stats;
  }
}

// ---- CRUD service for integration entities + field maps ----

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface IntegrationEntityInput {
  entity_type: string;
  name: string;
  base_url: string;
  endpoint: string;
  api_key?: string;
  sync_direction?: 'pull' | 'push';
  schedule?: string;
  page_size?: number;
  enabled?: boolean;
}

export interface FieldMapInput {
  source_field: string;
  target_field: string;
  direction?: 'both' | 'push' | 'pull';
  transform?: string;
}

export class IntegrationService {
  constructor(private bridge: DeviceBridge) {}

  async listEntities(): Promise<IntegrationEntityRow[]> {
    return this.bridge.db.query<IntegrationEntityRow>('SELECT * FROM integration_entities ORDER BY entity_type ASC');
  }

  async getEntity(id: string): Promise<IntegrationEntityRow | null> {
    const rows = await this.bridge.db.query<IntegrationEntityRow>('SELECT * FROM integration_entities WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async getEntityByType(entityType: string): Promise<IntegrationEntityRow | null> {
    const rows = await this.bridge.db.query<IntegrationEntityRow>(
      'SELECT * FROM integration_entities WHERE entity_type = ?',
      [entityType]
    );
    return rows[0] ?? null;
  }

  async createEntity(input: IntegrationEntityInput): Promise<IntegrationEntityRow> {
    const id = randomHex(16);
    const timestamp = now();
    await this.bridge.db.execute(
      `INSERT INTO integration_entities (id, entity_type, name, type, status, base_url, api_key, endpoint, sync_direction, schedule, page_size, enabled, created_at, updated_at)
       VALUES (?, ?, ?, 'rest', 'idle', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.entity_type,
        input.name,
        input.base_url,
        input.api_key ?? null,
        input.endpoint,
        input.sync_direction ?? 'pull',
        input.schedule ?? '30s',
        input.page_size ?? 100,
        input.enabled === false ? 0 : 1,
        timestamp,
        timestamp,
      ]
    );
    return (await this.getEntity(id))!;
  }

  async updateEntity(id: string, patch: Partial<IntegrationEntityInput> & { enabled?: boolean; push_cursor?: string | null }): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, value: unknown) => {
      fields.push(`${col} = ?`);
      params.push(value);
    };

    if (patch.name !== undefined) set('name', patch.name);
    if (patch.base_url !== undefined) set('base_url', patch.base_url);
    if (patch.endpoint !== undefined) set('endpoint', patch.endpoint);
    if (patch.api_key !== undefined) set('api_key', patch.api_key);
    if (patch.sync_direction !== undefined) set('sync_direction', patch.sync_direction);
    if (patch.schedule !== undefined) set('schedule', patch.schedule);
    if (patch.page_size !== undefined) set('page_size', patch.page_size);
    if (patch.enabled !== undefined) set('enabled', patch.enabled ? 1 : 0);
    if (patch.push_cursor !== undefined) set('push_cursor', patch.push_cursor);

    if (fields.length === 0) return;
    set('updated_at', now());
    params.push(id);
    await this.bridge.db.execute(`UPDATE integration_entities SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  async deleteEntity(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM integration_entities WHERE id = ?', [id]);
  }

  async listFieldMaps(entityId: string): Promise<IntegrationFieldMapRow[]> {
    return this.bridge.db.query<IntegrationFieldMapRow>(
      'SELECT * FROM integration_field_maps WHERE integration_entity_id = ? ORDER BY source_field ASC',
      [entityId]
    );
  }

  async createFieldMap(entityId: string, entityType: string, input: FieldMapInput): Promise<void> {
    const timestamp = now();
    await this.bridge.db.execute(
      `INSERT INTO integration_field_maps (id, integration_entity_id, entity_type, source_field, target_field, direction, transform, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomHex(16),
        entityId,
        entityType,
        input.source_field,
        input.target_field,
        input.direction ?? 'both',
        input.transform ?? null,
        timestamp,
        timestamp,
      ]
    );
  }

  async deleteFieldMap(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM integration_field_maps WHERE id = ?', [id]);
  }
}
