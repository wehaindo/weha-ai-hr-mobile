// Cloud capability IPC — the main-process handlers behind DeviceBridge.cloud.

import { ipcMain } from 'electron';
import { cloudRequest, googleOAuth, type CloudRequest } from '../services/cloud';

export function registerCloudIpc(): void {
  ipcMain.handle('cloud:request', async (_event, req: CloudRequest) => cloudRequest(req));

  ipcMain.handle(
    'cloud:google-oauth',
    async (_event, payload: { authorizeUrl: string; port?: number; timeoutMs?: number; clientId?: string; clientSecret?: string }) =>
      googleOAuth(payload.authorizeUrl, {
        port: payload.port,
        timeoutMs: payload.timeoutMs,
        clientId: payload.clientId,
        clientSecret: payload.clientSecret,
      })
  );
}
