// Realtime capability IPC — the main-process handlers behind DeviceBridge.realtime.

import { ipcMain } from 'electron';
import { realtimeService } from '../services/realtime';
import type { RealtimeIdentity } from '../../src/integration/realtime/realtime-client';

export function registerRealtimeIpc(): void {
  ipcMain.handle('realtime:connect', (_event, payload: { url: string; identity: RealtimeIdentity }) => {
    realtimeService.connect(payload.url, payload.identity);
  });

  ipcMain.handle('realtime:disconnect', () => {
    realtimeService.disconnect();
  });

  ipcMain.handle('realtime:send-event', (_event, payload: { eventType: string; data: unknown; severity?: string }) => {
    realtimeService.sendEvent(payload.eventType, payload.data, payload.severity);
  });

  ipcMain.handle('realtime:send-heartbeat', (_event, payload: { status?: string; data?: unknown }) => {
    realtimeService.sendHeartbeat(payload.status, payload.data);
  });

  ipcMain.handle('realtime:set-status', (_event, payload: { status: string }) => {
    realtimeService.setStatus(payload.status);
  });

  ipcMain.handle('realtime:get-status', () => realtimeService.getStatus());
}
