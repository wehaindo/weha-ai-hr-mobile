// Supabase config service — CRUD over supabase_configs + supabase_column_maps
// via the DeviceBridge. The config holds the project URL, token, identity
// (tenant/store/branch/terminal), batch size + max retries, and license flag.

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

export interface SupabaseConfigRow {
  id: string;
  name: string;
  supabase_url: string;
  access_token: string | null;
  installation_id: string | null;
  sync_mode: 'realtime' | 'scheduled' | 'manual';
  sync_interval_minutes: number;
  batch_size: number;
  max_retries: number;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  is_active: number;
  tenant_id: string | null;
  store_id: string | null;
  branch_id: string | null;
  terminal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseColumnMapRow {
  id: string;
  config_id: string;
  weha_field: string;
  supabase_column: string;
  sequence: number;
  is_enabled: number;
  transform: string | null;
}

export class SupabaseConfigService {
  constructor(private bridge: DeviceBridge) {}

  async getConfig(): Promise<SupabaseConfigRow | null> {
    const rows = await this.bridge.db.query<SupabaseConfigRow>('SELECT * FROM supabase_configs ORDER BY created_at ASC LIMIT 1');
    return rows[0] ?? null;
  }

  async saveConfig(input: {
    name: string;
    supabase_url: string;
    access_token?: string;
    installation_id?: string;
    sync_mode?: 'realtime' | 'scheduled' | 'manual';
    sync_interval_minutes?: number;
    batch_size?: number;
    max_retries?: number;
    tenant_id?: string;
    store_id?: string;
    branch_id?: string;
    terminal_id?: string;
    is_active?: boolean;
  }): Promise<SupabaseConfigRow> {
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
      set('supabase_url', input.supabase_url);
      if (input.access_token !== undefined) set('access_token', input.access_token);
      if (input.installation_id !== undefined) set('installation_id', input.installation_id);
      if (input.sync_mode !== undefined) set('sync_mode', input.sync_mode);
      if (input.sync_interval_minutes !== undefined) set('sync_interval_minutes', input.sync_interval_minutes);
      if (input.batch_size !== undefined) set('batch_size', input.batch_size);
      if (input.max_retries !== undefined) set('max_retries', input.max_retries);
      if (input.tenant_id !== undefined) set('tenant_id', input.tenant_id);
      if (input.store_id !== undefined) set('store_id', input.store_id);
      if (input.branch_id !== undefined) set('branch_id', input.branch_id);
      if (input.terminal_id !== undefined) set('terminal_id', input.terminal_id);
      if (input.is_active !== undefined) set('is_active', input.is_active ? 1 : 0);
      set('updated_at', timestamp);
      params.push(existing.id);
      await this.bridge.db.execute(`UPDATE supabase_configs SET ${fields.join(', ')} WHERE id = ?`, params);
      return (await this.getConfig())!;
    }

    const id = randomHex(16);
    await this.bridge.db.execute(
      `INSERT INTO supabase_configs (id, name, supabase_url, access_token, installation_id, sync_mode, sync_interval_minutes, batch_size, max_retries, status, is_active, tenant_id, store_id, branch_id, terminal_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.supabase_url,
        input.access_token ?? null,
        input.installation_id ?? null,
        input.sync_mode ?? 'manual',
        input.sync_interval_minutes ?? 5,
        input.batch_size ?? 100,
        input.max_retries ?? 5,
        input.is_active === false ? 0 : 1,
        input.tenant_id ?? null,
        input.store_id ?? null,
        input.branch_id ?? null,
        input.terminal_id ?? null,
        timestamp,
        timestamp,
      ]
    );
    return (await this.getConfig())!;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.bridge.db.execute('UPDATE supabase_configs SET is_active = ?, updated_at = ? WHERE id = ?', [
      enabled ? 1 : 0,
      now(),
      (await this.getConfig())?.id ?? '',
    ]);
  }

  async deleteConfig(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM supabase_configs WHERE id = ?', [id]);
  }

  // ---- column maps ----

  async listColumnMaps(configId: string): Promise<ColumnMap[]> {
    const rows = await this.bridge.db.query<SupabaseColumnMapRow>(
      'SELECT * FROM supabase_column_maps WHERE config_id = ? ORDER BY sequence ASC',
      [configId]
    );
    return rows.map((r) => ({
      id: r.id,
      config_id: r.config_id,
      weha_field: r.weha_field,
      column: r.supabase_column,
      sequence: r.sequence,
      is_enabled: r.is_enabled,
      transform: r.transform,
    }));
  }

  async saveColumnMaps(configId: string, maps: Array<Omit<ColumnMap, 'id' | 'config_id'>>): Promise<void> {
    await this.bridge.db.execute('DELETE FROM supabase_column_maps WHERE config_id = ?', [configId]);
    const timestamp = now();
    for (let i = 0; i < maps.length; i++) {
      const m = maps[i];
      await this.bridge.db.execute(
        `INSERT INTO supabase_column_maps (id, config_id, weha_field, supabase_column, sequence, is_enabled, transform, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomHex(16), configId, m.weha_field, m.column, m.sequence ?? i, m.is_enabled === false ? 0 : 1, m.transform ?? null, timestamp, timestamp]
      );
    }
  }
}
