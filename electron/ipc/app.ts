import { ipcMain } from 'electron';
import deviceConfig from '../../device.config';
import { notify } from '../services/notifier';
import { getMainWindow, openSecondaryWindow, type SecondaryWindowOptions } from '../services/window-manager';
import { getDbPath } from '../services/database';

export function registerAppIpc(): void {
  ipcMain.handle('app:info', () => ({
    name: deviceConfig.appName,
    version: deviceConfig.version,
    platform: 'electron',
    userDataPath: getDbPath(),
  }));

  ipcMain.handle('app:notify', (_event, payload: { title: string; body: string }) => {
    notify(payload.title, payload.body);
  });

  ipcMain.handle('window:open', (_event, payload: { route: string; options?: SecondaryWindowOptions }) => {
    openSecondaryWindow(payload.route, payload.options ?? {});
  });

  ipcMain.handle('window:control', (_event, action: 'minimize' | 'maximize' | 'restore' | 'close') => {
    const win = getMainWindow();
    if (!win) return;
    switch (action) {
      case 'minimize':
        win.minimize();
        break;
      case 'maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        break;
      case 'restore':
        win.restore();
        break;
      case 'close':
        win.close();
        break;
    }
  });
}
