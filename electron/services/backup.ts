// Backup file operations for the main process — native save/open dialogs + .db
// file copy. The main-process half of the DeviceBridge `backup` capability. The
// portable JSON export/import lives renderer-side (src/lib/backup/service.ts);
// this adds the ai-pos-parity native .db file copy for Electron.

import { dialog } from 'electron';
import * as fs from 'fs';
import { getDbPath, shutdownDatabase } from './database';

/** Native save dialog + copy the live .db file to the chosen path. */
export async function saveToFile(): Promise<{ path: string } | null> {
  const dbPath = getDbPath();
  const result = await dialog.showSaveDialog({
    title: 'Save backup',
    defaultPath: `weha-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
  });
  if (result.canceled || !result.filePath) return null;

  // Flush the in-memory DB to disk before copying.
  await shutdownDatabase().catch(() => {});
  fs.copyFileSync(dbPath, result.filePath);
  return { path: result.filePath };
}

/** Native open dialog + restore a .db file over the live one (safety copy first). */
export async function openFile(): Promise<{ path: string } | null> {
  const dbPath = getDbPath();
  const result = await dialog.showOpenDialog({
    title: 'Restore backup',
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const source = result.filePaths[0];

  // Safety copy of the current DB before overwriting.
  const safety = `${dbPath}.before-restore`;
  await shutdownDatabase().catch(() => {});
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safety);
  fs.copyFileSync(source, dbPath);
  return { path: source };
}
