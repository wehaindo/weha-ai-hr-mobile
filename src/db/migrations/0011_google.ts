import type { Migration } from '../migrate';

// Google Sheets orderline sync, adopted from ai-pos. An account holds OAuth
// tokens; a sheet config targets one spreadsheet/worksheet with a sync mode; a
// column map translates POS fields → sheet columns; jobs are the durable queue
// (one row per order line) and logs are the audit trail.
export const migration0011Google: Migration = {
  id: '0011_google',
  up: (db) => {
    db.execute(`
      CREATE TABLE google_accounts (
        id TEXT PRIMARY KEY,
        email TEXT,
        google_user_id TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry TEXT,
        client_id TEXT,
        client_secret TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
        last_validated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE google_sheet_configs (
        id TEXT PRIMARY KEY,
        google_account_id TEXT REFERENCES google_accounts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        spreadsheet_id TEXT,
        spreadsheet_name TEXT,
        worksheet_name TEXT NOT NULL DEFAULT 'Order Lines',
        sync_mode TEXT NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('realtime', 'scheduled', 'manual')),
        sync_interval_minutes INTEGER NOT NULL DEFAULT 5,
        store_id TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
        last_sync_at TEXT,
        last_sync_cursor TEXT,
        last_error TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE google_sheet_column_maps (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES google_sheet_configs(id) ON DELETE CASCADE,
        weha_field TEXT NOT NULL,
        sheet_column TEXT NOT NULL,
        column_header TEXT,
        sequence INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        transform TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_google_column_maps_config ON google_sheet_column_maps(config_id)`);

    db.execute(`
      CREATE TABLE google_sync_jobs (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES google_sheet_configs(id) ON DELETE CASCADE,
        order_id TEXT,
        order_line_id TEXT,
        sync_id TEXT UNIQUE NOT NULL,
        action TEXT NOT NULL DEFAULT 'insert' CHECK (action IN ('insert', 'update', 'cancel')),
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'retry', 'cancelled')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        last_error TEXT,
        sheet_row_number INTEGER,
        processed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_google_sync_jobs_status ON google_sync_jobs(config_id, status)`);

    db.execute(`
      CREATE TABLE google_sync_logs (
        id TEXT PRIMARY KEY,
        config_id TEXT REFERENCES google_sheet_configs(id) ON DELETE CASCADE,
        job_id TEXT,
        action TEXT,
        status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
        records_synced INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        request_duration_ms INTEGER,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_google_sync_logs_config ON google_sync_logs(config_id, created_at)`);
  },
};
