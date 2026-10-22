import type { Migration } from '../migrate';

// Supabase orderline sync, adopted from ai-pos — the most evolved destination.
// A config holds the project URL + token + identity (tenant/store/branch/
// terminal) + batch/retry settings; column maps translate POS fields → table
// columns; jobs are the durable queue (idempotent upsert on `id`).
export const migration0013Supabase: Migration = {
  id: '0013_supabase',
  up: (db) => {
    db.execute(`
      CREATE TABLE supabase_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        supabase_url TEXT NOT NULL,
        access_token TEXT,
        installation_id TEXT,
        sync_mode TEXT NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('realtime', 'scheduled', 'manual')),
        sync_interval_minutes INTEGER NOT NULL DEFAULT 5,
        batch_size INTEGER NOT NULL DEFAULT 100,
        max_retries INTEGER NOT NULL DEFAULT 5,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
        last_sync_at TEXT,
        last_error TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        tenant_id TEXT,
        store_id TEXT,
        branch_id TEXT,
        terminal_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE supabase_column_maps (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES supabase_configs(id) ON DELETE CASCADE,
        weha_field TEXT NOT NULL,
        supabase_column TEXT NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        transform TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_supabase_column_maps_config ON supabase_column_maps(config_id)`);

    db.execute(`
      CREATE TABLE supabase_sync_jobs (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES supabase_configs(id) ON DELETE CASCADE,
        order_id TEXT,
        order_line_id TEXT,
        sync_id TEXT UNIQUE NOT NULL,
        action TEXT NOT NULL DEFAULT 'insert' CHECK (action IN ('insert', 'update', 'cancel')),
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'retry', 'cancelled')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        last_error TEXT,
        supabase_record_id TEXT,
        processed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_supabase_sync_jobs_status ON supabase_sync_jobs(config_id, status)`);

    db.execute(`
      CREATE TABLE supabase_sync_logs (
        id TEXT PRIMARY KEY,
        config_id TEXT REFERENCES supabase_configs(id) ON DELETE CASCADE,
        job_id TEXT,
        action TEXT,
        status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
        records_synced INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        request_duration_ms INTEGER,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_supabase_sync_logs_config ON supabase_sync_logs(config_id, created_at)`);
  },
};
