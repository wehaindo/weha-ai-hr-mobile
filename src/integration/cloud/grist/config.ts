// Grist config service — CRUD over grist_configs + grist_column_maps via the
// DeviceBridge. A config targets one Grist doc + table with a sync mode and
// table_mode (single/daily/monthly). Token auth via `Authorization: Bearer`.

import type { DeviceBridge } from '@/platform';
import type { ColumnMap } from '../shared';

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

export interface GristConfigRow {
  id: string;
  name: string;
  grist_url: string;
  api_token: string | null;
  doc_id: string | null;
  table_id: string;
  table_mode: 'single' | 'daily' | 'monthly';
  sync_mode: 'realtime' | 'scheduled' | 'manual';
  sync_interval_minutes: number;
  store_id: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GristColumnMapRow {
  id: string;
  config_id: string;
  weha_field: string;
  grist_column: string;
  sequence: number;
  is_enabled: number;
  transform: string | null;
}

export class GristConfigService {
  constructor(private bridge: DeviceBridge) {}

  async getConfig(): Promise<GristConfigRow | null> {
    const rows = await this.bridge.db.query<GristConfigRow>('SELECT * FROM grist_configs ORDER BY created_at ASC LIMIT 1');
    return rows[0] ?? null;
  }

  async saveConfig(input: {
    name: string;
    grist_url: string;
    api_token?: string;
    doc_id?: string;
    table_id?: string;
    table_mode?: 'single' | 'daily' | 'monthly';
    sync_mode?: 'realtime' | 'scheduled' | 'manual';
    sync_interval_minutes?: number;
    store_id?: string;
    is_active?: boolean;
  }): Promise<GristConfigRow> {
    const existing = await this.getConfig();
    const timestamp = now();

    if (existing) {
      const fields: string[] = [];
      const params: unknown[] = [];
      const set = (col: string, value: unknown) => {
        fields.push(`${col} = ?`);
        params.push(value);
      };
      set('name', input.name);
      set('grist_url', input.grist_url);
      if (input.api_token !== undefined) set('api_token', input.api_token);
      if (input.doc_id !== undefined) set('doc_id', input.doc_id);
      if (input.table_id !== undefined) set('table_id', input.table_id);
      if (input.table_mode !== undefined) set('table_mode', input.table_mode);
      if (input.sync_mode !== undefined) set('sync_mode', input.sync_mode);
      if (input.sync_interval_minutes !== undefined) set('sync_interval_minutes', input.sync_interval_minutes);
      if (input.store_id !== undefined) set('store_id', input.store_id);
      if (input.is_active !== undefined) set('is_active', input.is_active ? 1 : 0);
      set('updated_at', timestamp);
      params.push(existing.id);
      await this.bridge.db.execute(`UPDATE grist_configs SET ${fields.join(', ')} WHERE id = ?`, params);
      return (await this.getConfig())!;
    }

    const id = randomHex(16);
    await this.bridge.db.execute(
      `INSERT INTO grist_configs (id, name, grist_url, api_token, doc_id, table_id, table_mode, sync_mode, sync_interval_minutes, store_id, status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        id,
        input.name,
        input.grist_url,
        input.api_token ?? null,
        input.doc_id ?? null,
        input.table_id ?? 'OrderLines',
        input.table_mode ?? 'single',
        input.sync_mode ?? 'manual',
        input.sync_interval_minutes ?? 5,
        input.store_id ?? null,
        input.is_active === false ? 0 : 1,
        timestamp,
        timestamp,
      ]
    );
    return (await this.getConfig())!;
  }

  async deleteConfig(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM grist_configs WHERE id = ?', [id]);
  }

  // ---- column maps ----

  async listColumnMaps(configId: string): Promise<ColumnMap[]> {
    const rows = await this.bridge.db.query<GristColumnMapRow>(
      'SELECT * FROM grist_column_maps WHERE config_id = ? ORDER BY sequence ASC',
      [configId]
    );
    return rows.map((r) => ({
      id: r.id,
      config_id: r.config_id,
      weha_field: r.weha_field,
      column: r.grist_column,
      sequence: r.sequence,
      is_enabled: r.is_enabled,
      transform: r.transform,
    }));
  }

  async saveColumnMaps(configId: string, maps: Array<Omit<ColumnMap, 'id' | 'config_id'>>): Promise<void> {
    await this.bridge.db.execute('DELETE FROM grist_column_maps WHERE config_id = ?', [configId]);
    const timestamp = now();
    for (let i = 0; i < maps.length; i++) {
      const m = maps[i];
      await this.bridge.db.execute(
        `INSERT INTO grist_column_maps (id, config_id, weha_field, grist_column, sequence, is_enabled, transform, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomHex(16), configId, m.weha_field, m.column, m.sequence ?? i, m.is_enabled === false ? 0 : 1, m.transform ?? null, timestamp, timestamp]
      );
    }
  }
}
