// Google Sheets config service — CRUD over google_accounts, google_sheet_configs,
// and google_sheet_column_maps via the DeviceBridge. Token refresh is handled
// here (persisting the new access token + expiry back to the account row).

import type { DeviceBridge } from '@/platform';
import { GoogleClient, isTokenExpired, refreshAccessToken, type GoogleAccountTokens } from './client';
import type { ColumnMap } from '../shared';

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

export interface GoogleAccountRow {
  id: string;
  email: string | null;
  google_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  client_id: string | null;
  client_secret: string | null;
  status: string;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleSheetConfigRow {
  id: string;
  google_account_id: string | null;
  name: string;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  worksheet_name: string;
  sync_mode: 'realtime' | 'scheduled' | 'manual';
  sync_interval_minutes: number;
  store_id: string | null;
  status: string;
  last_sync_at: string | null;
  last_sync_cursor: string | null;
  last_error: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GoogleColumnMapRow {
  id: string;
  config_id: string;
  weha_field: string;
  sheet_column: string;
  column_header: string | null;
  sequence: number;
  is_enabled: number;
  transform: string | null;
}

export class GoogleConfigService {
  constructor(private bridge: DeviceBridge) {}

  // ---- accounts ----

  async listAccounts(): Promise<GoogleAccountRow[]> {
    return this.bridge.db.query<GoogleAccountRow>('SELECT * FROM google_accounts ORDER BY created_at DESC');
  }

  async getAccount(id: string): Promise<GoogleAccountRow | null> {
    const rows = await this.bridge.db.query<GoogleAccountRow>('SELECT * FROM google_accounts WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async saveAccount(input: {
    email?: string;
    google_user_id?: string;
    access_token: string;
    refresh_token?: string;
    token_expiry?: string;
    client_id: string;
    client_secret: string;
  }): Promise<GoogleAccountRow> {
    const existing = (await this.listAccounts())[0];
    const timestamp = now();

    if (existing) {
      await this.bridge.db.execute(
        `UPDATE google_accounts SET email = ?, google_user_id = ?, access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expiry = ?, client_id = ?, client_secret = ?, status = 'active', updated_at = ? WHERE id = ?`,
        [
          input.email ?? existing.email,
          input.google_user_id ?? existing.google_user_id,
          input.access_token,
          input.refresh_token ?? null,
          input.token_expiry ?? null,
          input.client_id,
          input.client_secret,
          timestamp,
          existing.id,
        ]
      );
      return (await this.getAccount(existing.id))!;
    }

    const id = randomHex(16);
    await this.bridge.db.execute(
      `INSERT INTO google_accounts (id, email, google_user_id, access_token, refresh_token, token_expiry, client_id, client_secret, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [id, input.email ?? null, input.google_user_id ?? null, input.access_token, input.refresh_token ?? null, input.token_expiry ?? null, input.client_id, input.client_secret, timestamp, timestamp]
    );
    return (await this.getAccount(id))!;
  }

  async deleteAccount(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM google_accounts WHERE id = ?', [id]);
  }

  /** Build a GoogleClient bound to an account, refreshing the token if expired. */
  async createClient(bridge: DeviceBridge, accountId?: string): Promise<GoogleClient> {
    const account = accountId ? await this.getAccount(accountId) : (await this.listAccounts())[0];
    if (!account) throw new Error('No Google account connected');

    let tokens: GoogleAccountTokens = {
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      token_expiry: account.token_expiry,
      client_id: account.client_id,
      client_secret: account.client_secret,
    };

    if (isTokenExpired(tokens)) {
      const refreshed = await refreshAccessToken(bridge, tokens);
      const expiry = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
      await this.bridge.db.execute('UPDATE google_accounts SET access_token = ?, token_expiry = ?, updated_at = ? WHERE id = ?', [
        refreshed.access_token,
        expiry,
        now(),
        account.id,
      ]);
      tokens = { ...tokens, access_token: refreshed.access_token, token_expiry: expiry };
    }

    return new GoogleClient(bridge, tokens);
  }

  // ---- sheet configs ----

  async listConfigs(): Promise<GoogleSheetConfigRow[]> {
    return this.bridge.db.query<GoogleSheetConfigRow>('SELECT * FROM google_sheet_configs ORDER BY created_at DESC');
  }

  async getConfig(id: string): Promise<GoogleSheetConfigRow | null> {
    const rows = await this.bridge.db.query<GoogleSheetConfigRow>('SELECT * FROM google_sheet_configs WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async getActiveConfig(): Promise<GoogleSheetConfigRow | null> {
    const rows = await this.bridge.db.query<GoogleSheetConfigRow>(
      "SELECT * FROM google_sheet_configs WHERE is_active = 1 AND sync_mode != 'manual' LIMIT 1"
    );
    return rows[0] ?? null;
  }

  async createConfig(input: {
    name: string;
    google_account_id?: string;
    spreadsheet_id?: string;
    spreadsheet_name?: string;
    worksheet_name?: string;
    sync_mode?: 'realtime' | 'scheduled' | 'manual';
    sync_interval_minutes?: number;
    store_id?: string;
  }): Promise<GoogleSheetConfigRow> {
    const id = randomHex(16);
    const timestamp = now();
    await this.bridge.db.execute(
      `INSERT INTO google_sheet_configs (id, google_account_id, name, spreadsheet_id, spreadsheet_name, worksheet_name, sync_mode, sync_interval_minutes, store_id, status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
      [
        id,
        input.google_account_id ?? null,
        input.name,
        input.spreadsheet_id ?? null,
        input.spreadsheet_name ?? null,
        input.worksheet_name ?? 'Order Lines',
        input.sync_mode ?? 'manual',
        input.sync_interval_minutes ?? 5,
        input.store_id ?? null,
        timestamp,
        timestamp,
      ]
    );
    return (await this.getConfig(id))!;
  }

  async updateConfig(id: string, patch: Partial<GoogleSheetConfigRow>): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, value: unknown) => {
      fields.push(`${col} = ?`);
      params.push(value);
    };
    for (const key of ['name', 'spreadsheet_id', 'spreadsheet_name', 'worksheet_name', 'sync_mode', 'sync_interval_minutes', 'store_id', 'status', 'is_active'] as const) {
      if (patch[key] !== undefined) set(key, patch[key]);
    }
    if (fields.length === 0) return;
    set('updated_at', now());
    params.push(id);
    await this.bridge.db.execute(`UPDATE google_sheet_configs SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  async deleteConfig(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM google_sheet_configs WHERE id = ?', [id]);
  }

  // ---- column maps ----

  async listColumnMaps(configId: string): Promise<ColumnMap[]> {
    const rows = await this.bridge.db.query<GoogleColumnMapRow>(
      'SELECT * FROM google_sheet_column_maps WHERE config_id = ? ORDER BY sequence ASC',
      [configId]
    );
    return rows.map((r) => ({
      id: r.id,
      config_id: r.config_id,
      weha_field: r.weha_field,
      column: r.sheet_column,
      column_header: r.column_header,
      sequence: r.sequence,
      is_enabled: r.is_enabled,
      transform: r.transform,
    }));
  }

  async saveColumnMaps(configId: string, maps: Array<Omit<ColumnMap, 'id' | 'config_id'>>): Promise<void> {
    // Replace-all: delete existing, insert the new set.
    await this.bridge.db.execute('DELETE FROM google_sheet_column_maps WHERE config_id = ?', [configId]);
    const timestamp = now();
    for (let i = 0; i < maps.length; i++) {
      const m = maps[i];
      await this.bridge.db.execute(
        `INSERT INTO google_sheet_column_maps (id, config_id, weha_field, sheet_column, column_header, sequence, is_enabled, transform, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomHex(16), configId, m.weha_field, m.column, m.column_header ?? null, m.sequence ?? i, m.is_enabled === false ? 0 : 1, m.transform ?? null, timestamp, timestamp]
      );
    }
  }
}
