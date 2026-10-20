import type { Migration } from '../migrate';

// P3 of the hub integration: enrollment-key based registration (the device
// exchanges a sek_… key for its dhs_… token) and local storage for hub
// _sync_rejects events so the sync monitor can surface rejected pushes.
export const migration0023DatahubEnrollment: Migration = {
  id: '0023_datahub_enrollment',
  up: (db) => {
    const cols = db.query<{ name: string }>('PRAGMA table_info(datahub_configs)');
    if (!cols.some((col) => col.name === 'enrollment_key')) {
      db.execute('ALTER TABLE datahub_configs ADD COLUMN enrollment_key TEXT');
    }

    db.execute(`
      CREATE TABLE IF NOT EXISTS datahub_rejects (
        id TEXT PRIMARY KEY,
        device_id TEXT,
        entity_type TEXT,
        entity_id TEXT,
        original_event_id TEXT,
        execution_id TEXT,
        error TEXT,
        failed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
};
