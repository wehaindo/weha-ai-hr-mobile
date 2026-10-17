import type { Migration } from '../migrate';

export const migration0001Core: Migration = {
  id: '0001_core',
  up: (db) => {
    db.execute(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        avatar_color TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      )
    `);

    db.execute(`
      CREATE TABLE device_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE integrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'erp',
        config TEXT NOT NULL DEFAULT '{}',
        device_token TEXT,
        status TEXT NOT NULL DEFAULT 'inactive',
        last_sync_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_sync_queue_status ON sync_queue(status, id)`);

    db.execute(`
      CREATE TABLE sync_definitions (
        id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'outbound',
        config TEXT NOT NULL DEFAULT '{}',
        conflict_policy TEXT NOT NULL DEFAULT 'local_wins',
        enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 100,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        integration_id TEXT,
        entity_type TEXT,
        direction TEXT,
        status TEXT NOT NULL,
        message TEXT,
        detail TEXT,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_sync_log_created ON sync_log(created_at)`);

    db.execute(`
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        detail TEXT,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_audit_log_created ON audit_log(created_at)`);
  },
};
