// Preload — exposes the generic DeviceBridge only. No per-entity IPC methods.

import { contextBridge, ipcRenderer } from 'electron';
import type { WindowOpenOptions } from '../src/platform/bridge';

const EVENT_CHANNELS = new Set([
  'db:changed',
  'command',
  'window:state',
  'sync:status',
  'realtime:status',
  'realtime:command',
]);

contextBridge.exposeInMainWorld('deviceBridge', {
  platform: 'electron',

  appInfo: () => ipcRenderer.invoke('app:info'),

  db: {
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
    execute: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:execute', sql, params),
    batch: (statements: unknown[]) => ipcRenderer.invoke('db:batch', statements),
    flush: () => ipcRenderer.invoke('db:flush'),
  },

  kv: {
    get: (key: string) => ipcRenderer.invoke('kv:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('kv:set', key, value),
    remove: (key: string) => ipcRenderer.invoke('kv:remove', key),
  },

  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', { title, body }),

  window: {
    open: (route: string, options?: WindowOpenOptions) => ipcRenderer.invoke('window:open', { route, options }),
    control: (action: string) => ipcRenderer.invoke('window:control', action),
  },

  print: {
    raw: (target: string, bytes: Uint8Array) => ipcRenderer.invoke('print:raw', { target, bytes }),
  },

  hardware: {
    openDrawer: (target: string) => ipcRenderer.invoke('hardware:open-drawer', { target }),
    serial: (target: { port_path: string; baud_rate?: number }, bytes: Uint8Array) =>
      ipcRenderer.invoke('hardware:serial', { target, bytes }),
    discover: () => ipcRenderer.invoke('hardware:discover'),
    test: (target: string) => ipcRenderer.invoke('hardware:test', target),
    exchange: async (
      target: { port_path?: string; baud_rate?: number; ip?: string; port?: number },
      bytes: Uint8Array,
      options?: { timeoutMs?: number }
    ) => {
      const result = await ipcRenderer.invoke('hardware:exchange', { target, bytes, timeoutMs: options?.timeoutMs });
      return Uint8Array.from(result as number[]);
    },
  },

  realtime: {
    connect: (options: { url: string; identity: unknown }) => ipcRenderer.invoke('realtime:connect', options),
    disconnect: () => ipcRenderer.invoke('realtime:disconnect'),
    sendEvent: (eventType: string, data: unknown, severity?: string) =>
      ipcRenderer.invoke('realtime:send-event', { eventType, data, severity }),
    sendHeartbeat: (status?: string, data?: unknown) => ipcRenderer.invoke('realtime:send-heartbeat', { status, data }),
    setStatus: (status: string) => ipcRenderer.invoke('realtime:set-status', { status }),
    getStatus: () => ipcRenderer.invoke('realtime:get-status'),
  },

  cloud: {
    request: (req: unknown) => ipcRenderer.invoke('cloud:request', req),
    googleOAuth: (authorizeUrl: string, options?: { port?: number; timeoutMs?: number; clientId?: string; clientSecret?: string }) =>
      ipcRenderer.invoke('cloud:google-oauth', { authorizeUrl, ...options }),
  },

  backup: {
    saveToFile: () => ipcRenderer.invoke('backup:save-to-file'),
    openFile: () => ipcRenderer.invoke('backup:open-file'),
  },

  display: {
    open: (id: string, href: string) => ipcRenderer.invoke('display:open', { id, href }),
    close: (id: string) => ipcRenderer.invoke('display:close', id),
    isOpen: (id: string) => ipcRenderer.invoke('display:is-open', id),
  },

  // Location runs directly in this renderer-ish context (browser geolocation,
  // no IPC) — mirrors src/platform/renderer-location.ts. Structural local
  // types keep this file compiling under electron/tsconfig (no DOM lib).
  location: {
    permission: async () => {
      const nav = (
        globalThis as unknown as {
          navigator?: {
            geolocation?: unknown;
            permissions?: {
              query(descriptor: { name: string }): Promise<{ state: 'granted' | 'denied' | 'prompt' }>;
            };
          };
        }
      ).navigator;
      if (!nav?.geolocation) return 'unsupported';
      try {
        const status = await nav.permissions?.query({ name: 'geolocation' });
        if (status) return status.state;
      } catch {
        /* probe unsupported */
      }
      return 'prompt';
    },
    requestPermission: async () => {
      const geo = (
        globalThis as unknown as {
          navigator?: {
            geolocation?: {
              getCurrentPosition(
                success: () => void,
                error?: (err: { code: number }) => void,
                options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }
              ): void;
            };
          };
        }
      ).navigator?.geolocation;
      if (!geo) return 'denied';
      return new Promise<'granted' | 'denied'>((resolve) => {
        geo.getCurrentPosition(
          () => resolve('granted'),
          (err) => resolve(err.code === 1 ? 'denied' : 'granted'),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
        );
      });
    },
    getCurrent: async (options?: { timeoutMs?: number }) => {
      const geo = (
        globalThis as unknown as {
          navigator?: {
            geolocation?: {
              getCurrentPosition(
                success: (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void,
                error?: (err: { code: number }) => void,
                options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }
              ): void;
            };
          };
        }
      ).navigator?.geolocation;
      if (!geo) throw new Error('unsupported');
      return new Promise((resolve, reject) => {
        geo.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyMeters: pos.coords.accuracy,
              capturedAt: new Date().toISOString(),
            }),
          (err) =>
            reject(new Error(err.code === 1 ? 'permission_denied' : err.code === 3 ? 'timeout' : 'unavailable')),
          { enableHighAccuracy: true, maximumAge: 0, timeout: options?.timeoutMs ?? 15000 }
        );
      });
    },
  },

  events: {
    on: (event: string, listener: (payload: unknown) => void) => {
      if (!EVENT_CHANNELS.has(event)) return () => {};
      const handler = (_event: unknown, payload: unknown) => listener(payload);
      ipcRenderer.on(event, handler);
      return () => {
        ipcRenderer.removeListener(event, handler);
      };
    },
  },
});
