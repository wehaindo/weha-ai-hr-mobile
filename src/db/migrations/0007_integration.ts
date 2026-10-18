import type { Migration } from '../migrate';

// Per-entity REST sync config, adopted from ai-pos (integration_entities +
// integration_field_maps). Each row describes one entity synced against an
// external REST endpoint with a field map. Domain tables are NOT created here —
// the framework is entity-agnostic; a device app registers entities + tables.
export const migration0007Integration: Migration = {
  id: '0007_integration',
  up: (db) => {
    db.execute(`
      CREATE TABLE integration_entities (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'rest',
        status TEXT NOT NULL DEFAULT 'idle',
        base_url TEXT NOT NULL,
        api_key TEXT,
        endpoint TEXT NOT NULL,
        sync_direction TEXT NOT NULL DEFAULT 'pull' CHECK (sync_direction IN ('pull', 'push')),
        schedule TEXT NOT NULL DEFAULT '30s',
        page_size INTEGER NOT NULL DEFAULT 100,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        last_status TEXT,
        last_error TEXT,
        push_cursor TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE integration_field_maps (
        id TEXT PRIMARY KEY,
        integration_entity_id TEXT NOT NULL REFERENCES integration_entities(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        source_field TEXT NOT NULL,
        target_field TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'push', 'pull')),
        transform TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_integration_field_maps_entity ON integration_field_maps(integration_entity_id)`);
  },
};
