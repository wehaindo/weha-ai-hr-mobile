// Key-value settings storage on top of device_settings (JSON-encoded values).

import { ipcMain } from 'electron';
import type { DatabaseEngine } from '../../src/db/engine';

interface KvRow {
  value: string;
}

export function registerKvIpc(getEngine: () => DatabaseEngine): void {
  ipcMain.handle('kv:get', (_event, key: string) => {
    const rows = getEngine().query<KvRow>('SELECT value FROM device_settings WHERE key = ?', [key]);
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return rows[0].value;
    }
  });

  ipcMain.handle('kv:set', (_event, key: string, value: unknown) => {
    const encoded = JSON.stringify(value ?? null);
    getEngine().execute(
      `INSERT INTO device_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, encoded, new Date().toISOString()]
    );
  });

  ipcMain.handle('kv:remove', (_event, key: string) => {
    getEngine().execute('DELETE FROM device_settings WHERE key = ?', [key]);
  });
}
