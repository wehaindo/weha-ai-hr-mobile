// Electron main entry — slim by design. Heavy logic lives in services/ and ipc/.

import { app, BrowserWindow } from 'electron';
import { registerAppSchemes, setupProtocolHandler } from './services/protocol';
import { initDatabase, shutdownDatabase } from './services/database';
import { createMainWindow, getMainWindow } from './services/window-manager';
import { registerDbIpc } from './ipc/db';
import { registerKvIpc } from './ipc/kv';
import { registerAppIpc } from './ipc/app';
import { registerPrintIpc } from './ipc/print';
import { registerHardwareIpc } from './ipc/hardware';
import { registerRealtimeIpc } from './ipc/realtime';
import { registerCloudIpc } from './ipc/cloud';
import { registerBackupIpc } from './ipc/backup';
import { registerDisplayIpc } from './ipc/display';
import { registerRealtime } from './services/realtime';

// Must run before app is ready.
registerAppSchemes();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    setupProtocolHandler();

    const engine = await initDatabase();

    registerDbIpc(() => engine);
    registerKvIpc(() => engine);
    registerAppIpc();
    registerPrintIpc();
    registerHardwareIpc();
    registerRealtimeIpc();
    registerCloudIpc();
    registerBackupIpc();
    registerDisplayIpc();
    registerRealtime();

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    event.preventDefault();
    shutdownDatabase()
      .catch((err) => console.error('[db] shutdown flush failed:', err))
      .finally(() => app.exit(0));
  });
}
