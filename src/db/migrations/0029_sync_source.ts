import type { Migration } from '../migrate';

// The per-integration column grew from an auth choice (device / api_key) into a
// sync-source choice (device auth / data hub / api key), so rename it to reflect
// what it answers: "how does this integration sync". Values are unchanged by this
// migration (0027 added no CHECK); sql.js 1.14 (SQLite 3.4x) supports RENAME COLUMN.
export const migration0029SyncSource: Migration = {
  id: '0029_sync_source',
  up: (db) => {
    db.execute(`ALTER TABLE integration_entities RENAME COLUMN auth_type TO sync_source`);
  },
};
