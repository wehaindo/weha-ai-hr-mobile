// Display capability IPC — the main-process handlers behind DeviceBridge.display.
// Opens a fullscreen window on an external display for a registered route.

import { ipcMain } from 'electron';
import { openDisplay, closeDisplay, isDisplayOpen } from '../services/window-manager';

export function registerDisplayIpc(): void {
  ipcMain.handle('display:open', (_event, payload: { id: string; href: string }) => {
    openDisplay(payload.id, payload.href);
  });

  ipcMain.handle('display:close', (_event, id: string) => {
    closeDisplay(id);
  });

  ipcMain.handle('display:is-open', (_event, id: string) => isDisplayOpen(id));
}
