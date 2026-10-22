// Ordered migration runner. Migrations are applied once, tracked in `_migrations`,
// and each runs inside a transaction together with its ledger insert.

import type { DatabaseEngine } from './engine';

export interface Migration {
  id: string; // e.g. '0001_core' — lexicographic order matters
  up: (db: DatabaseEngine) => void;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export function runMigrations(db: DatabaseEngine, migrations: Migration[]): MigrationResult {
  db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`
  );

  const done = new Set(db.query<{ id: string }>('SELECT id FROM _migrations').map((r) => r.id));
  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id));
  const applied: string[] = [];

  for (const migration of sorted) {
    if (done.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      db.execute('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [
        migration.id,
        new Date().toISOString(),
      ]);
    });
    applied.push(migration.id);
  }

  return { applied, alreadyApplied: [...done] };
}
