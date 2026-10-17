// Preload — exposes the generic DeviceBridge only. No per-entity IPC methods.

import { contextBridge, ipcRenderer } from 'electron';
import type { WindowOpenOptions } from '../src/platform/bridge';

const EVENT_CHANNELS = new Set(['db:changed', 'command', 'window:state', 'sync:status']);

contextBridge.exposeInMainWorld('deviceBridge', {
  platform: 'electron',

  appInfo: () => ipcRenderer.invoke('app:info'),

  db: {
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
    execute: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:execute', sql, params),
    batch: (statements: unknown[]) => ipcRenderer.invoke('db:batch', statements),
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
