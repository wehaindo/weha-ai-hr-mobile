// Generic database IPC — replaces ai-pos's 500+ hand-typed entity handlers.
// Renderer repositories write SQL; this layer only executes and broadcasts changes.

import { ipcMain } from 'electron';
import type { DatabaseEngine, SqlStatement } from '../../src/db/engine';
import { broadcast } from '../services/window-manager';

export function registerDbIpc(getEngine: () => DatabaseEngine): void {
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => {
    return getEngine().query(sql, params ?? []);
  });

  ipcMain.handle('db:execute', (_event, sql: string, params?: unknown[]) => {
    getEngine().execute(sql, params ?? []);
    broadcast('db:changed', {});
  });

  ipcMain.handle('db:batch', (_event, statements: SqlStatement[]) => {
    getEngine().batch(statements);
    broadcast('db:changed', {});
  });

  // Persist pending writes immediately (bypasses the renderer engine's save
  // debounce) — used for auth-critical session writes that must survive a reload.
  ipcMain.handle('db:flush', async () => {
    await getEngine().flush();
  });
}
