import type { Migration } from '../migrate';

// Data Hub replication state, adopted from ai-pos. Cursor+ack event sync: the
// device pulls events by a per-entity cursor, applies them, and acks event_ids.
// The hub endpoint + device token live in datahub_configs.
export const migration0008Datahub: Migration = {
  id: '0008_datahub',
  up: (db) => {
    db.execute(`
      CREATE TABLE datahub_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Data Hub',
        endpoint TEXT NOT NULL,
        device_id TEXT,
        device_token TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        last_sync_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE datahub_sync_state (
        entity_type TEXT PRIMARY KEY,
        last_cursor INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE datahub_entity_map (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        local_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (entity_type, remote_id)
      )
    `);
    db.execute(`CREATE INDEX idx_datahub_entity_map_local ON datahub_entity_map(entity_type, local_id)`);
  },
};
