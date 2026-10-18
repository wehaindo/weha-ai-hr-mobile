import type { Migration } from '../migrate';

// Grist orderline sync, adopted from ai-pos. A config targets one Grist doc +
// table with a sync mode and table_mode (single/daily/monthly); column maps
// translate POS fields → Grist column labels; jobs are the durable queue.
export const migration0012Grist: Migration = {
  id: '0012_grist',
  up: (db) => {
    db.execute(`
      CREATE TABLE grist_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        grist_url TEXT NOT NULL,
        api_token TEXT,
        doc_id TEXT,
        table_id TEXT NOT NULL DEFAULT 'OrderLines',
        table_mode TEXT NOT NULL DEFAULT 'single' CHECK (table_mode IN ('single', 'daily', 'monthly')),
        sync_mode TEXT NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('realtime', 'scheduled', 'manual')),
        sync_interval_minutes INTEGER NOT NULL DEFAULT 5,
        store_id TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
        last_sync_at TEXT,
        last_error TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE grist_column_maps (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES grist_configs(id) ON DELETE CASCADE,
        weha_field TEXT NOT NULL,
        grist_column TEXT NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        transform TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_grist_column_maps_config ON grist_column_maps(config_id)`);

    db.execute(`
      CREATE TABLE grist_sync_jobs (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES grist_configs(id) ON DELETE CASCADE,
        order_id TEXT,
        order_line_id TEXT,
        sync_id TEXT UNIQUE NOT NULL,
        action TEXT NOT NULL DEFAULT 'insert' CHECK (action IN ('insert', 'update', 'cancel')),
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'retry', 'cancelled')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        last_error TEXT,
        grist_record_id TEXT,
        processed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_grist_sync_jobs_status ON grist_sync_jobs(config_id, status)`);

    db.execute(`
      CREATE TABLE grist_sync_logs (
        id TEXT PRIMARY KEY,
        config_id TEXT REFERENCES grist_configs(id) ON DELETE CASCADE,
        job_id TEXT,
        action TEXT,
        status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
        records_synced INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        request_duration_ms INTEGER,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_grist_sync_logs_config ON grist_sync_logs(config_id, created_at)`);
  },
};
