import type { Migration } from '../migrate';

export const migration0003Print: Migration = {
  id: '0003_print',
  up: (db) => {
    db.execute(`
      CREATE TABLE printer_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        connection_type TEXT NOT NULL DEFAULT 'tcp',
        target TEXT NOT NULL,
        width_mm INTEGER NOT NULL DEFAULT 80,
        is_default INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        options TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE print_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT,
        doc_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        printed_at TEXT
      )
    `);
    db.execute(`CREATE INDEX idx_print_queue_status ON print_queue(status, id)`);
  },
};
