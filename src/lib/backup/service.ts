// Backup service — portable export/import/factory-clear over the DeviceBridge.
// Works on every platform (renderer + bridge.db): export dumps all tables to a
// JSON snapshot; import restores; clearAll truncates everything except users +
// _migrations. This is more reusable than ai-pos's Electron-only file copy;
// the Electron bridge adds native .db file save/open for convenience.

import type { DeviceBridge } from '@/platform';

export interface BackupSnapshot {
  format: 'weha-backup';
  version: 1;
  exported_at: string;
  app: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Tables excluded from factory clear (must survive). */
const PRESERVED_TABLES = new Set(['users', '_migrations']);

async function listTables(bridge: DeviceBridge): Promise<string[]> {
  const rows = await bridge.db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return rows.map((r) => r.name);
}

/** Dump all tables into a JSON snapshot. */
export async function exportJson(bridge: DeviceBridge): Promise<string> {
  const appInfo = await bridge.appInfo();
  const tables = await listTables(bridge);
  const snapshot: BackupSnapshot = {
    format: 'weha-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    app: appInfo.name,
    tables: {},
  };

  for (const table of tables) {
    try {
      snapshot.tables[table] = await bridge.db.query<Record<string, unknown>>(`SELECT * FROM "${table}"`);
    } catch {
      snapshot.tables[table] = [];
    }
  }

  return JSON.stringify(snapshot, null, 2);
}

/** Restore a snapshot (clears + refills every table in it). */
export async function importJson(bridge: DeviceBridge, json: string): Promise<void> {
  let snapshot: BackupSnapshot;
  try {
    snapshot = JSON.parse(json) as BackupSnapshot;
  } catch {
    throw new Error('Invalid backup file (not JSON)');
  }
  if (snapshot?.format !== 'weha-backup' || !snapshot.tables) {
    throw new Error('Not a valid weha backup snapshot');
  }

  for (const [table, rows] of Object.entries(snapshot.tables)) {
    // Clear existing rows.
    await bridge.db.execute(`DELETE FROM "${table}"`);
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const columns = Object.keys(rows[0]);
    if (columns.length === 0) continue;
    const placeholders = columns.map(() => '?').join(', ');
    for (const row of rows) {
      await bridge.db.execute(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
        columns.map((c) => row[c] ?? null)
      );
    }
  }
}

/** Truncate all tables except users + _migrations (factory clear). Returns cleared table names. */
export async function clearAll(bridge: DeviceBridge): Promise<string[]> {
  const tables = await listTables(bridge);
  const cleared: string[] = [];
  for (const table of tables) {
    if (PRESERVED_TABLES.has(table)) continue;
    await bridge.db.execute(`DELETE FROM "${table}"`);
    cleared.push(table);
  }
  return cleared;
}

/** Trigger a browser download of a snapshot (works web + Electron renderer). */
export function downloadSnapshot(json: string, filename = `weha-backup-${new Date().toISOString().slice(0, 10)}.json`): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
