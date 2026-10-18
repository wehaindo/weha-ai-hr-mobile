// Hardware capability IPC — the main-process handlers behind DeviceBridge.hardware.

import { ipcMain } from 'electron';
import { hardwareService, type SerialTarget } from '../services/hardware';

export function registerHardwareIpc(): void {
  ipcMain.handle('hardware:open-drawer', async (_event, payload: { target: string }) => {
    await hardwareService.openDrawer(payload.target);
  });

  ipcMain.handle('hardware:serial', async (_event, payload: { target: SerialTarget; bytes: Uint8Array }) => {
    await hardwareService.serial(payload.target, Uint8Array.from(payload.bytes));
  });

  ipcMain.handle('hardware:discover', async () => hardwareService.discover());

  ipcMain.handle('hardware:test', async (_event, target: string) => hardwareService.test(target));

  ipcMain.handle(
    'hardware:exchange',
    async (
      _event,
      payload: { target: SerialTarget | { ip: string; port: number }; bytes: Uint8Array; timeoutMs?: number }
    ) => {
      const response = await hardwareService.exchange(payload.target, Uint8Array.from(payload.bytes), {
        timeoutMs: payload.timeoutMs,
      });
      // IPC structured clone: return a plain array for faithful Uint8Array rehydration.
      return Array.from(response);
    }
  );
}
