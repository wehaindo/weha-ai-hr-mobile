// Backup capability IPC — the main-process handlers behind DeviceBridge.backup.

import { ipcMain } from 'electron';
import { saveToFile, openFile } from '../services/backup';

export function registerBackupIpc(): void {
  ipcMain.handle('backup:save-to-file', () => saveToFile());
  ipcMain.handle('backup:open-file', () => openFile());
}
