// In-memory DeviceBridge backed by a real sql.js engine — used by tests that
// exercise repositories, outbox and the sync engine without a browser.

import { createEngine, type DatabaseEngine } from '@/db/engine';
import { MemoryBlobStore } from '@/db/persistence';
import { runMigrations } from '@/db/migrate';
import { frameworkMigrations } from '@/db/migrations';
import type { DeviceBridge, DeviceBridgeEventMap } from '@/platform/bridge';

export interface FakeBridgeHandle {
  bridge: DeviceBridge;
  engine: DatabaseEngine;
}

export async function createFakeBridge(): Promise<FakeBridgeHandle> {
  const engine = await createEngine(new MemoryBlobStore());
  runMigrations(engine, frameworkMigrations);

  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const emit = (event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };

  const kvGet = <T,>(key: string): T | null => {
    const rows = engine.query<{ value: string }>('SELECT value FROM device_settings WHERE key = ?', [key]);
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].value) as T;
    } catch {
      return rows[0].value as unknown as T;
    }
  };

  const bridge: DeviceBridge = {
    platform: 'web',

    appInfo: async () => ({ name: 'test', version: '0.0.0', platform: 'web' }),

    db: {
      query: async <T>(sql: string, params?: unknown[]) => engine.query<T>(sql, params),
      execute: async (sql: string, params?: unknown[]) => {
        engine.execute(sql, params);
        emit('db:changed', {});
      },
      batch: async (statements) => {
        engine.batch(statements);
        emit('db:changed', {});
      },
      async flush(): Promise<void> {
        await engine.flush();
      },
    },

    kv: {
      get: async <T>(key: string) => kvGet<T>(key),
      set: async (key: string, value: unknown) => {
        engine.execute(
          `INSERT INTO device_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, JSON.stringify(value ?? null), new Date().toISOString()]
        );
      },
      remove: async (key: string) => {
        engine.execute('DELETE FROM device_settings WHERE key = ?', [key]);
      },
    },

    notify: async () => {},

    window: {
      open: async () => {},
      control: async () => {},
    },

    print: {
      raw: async () => {
        throw new Error('printing not available in tests');
      },
    },

    hardware: {
      openDrawer: async () => {
        throw new Error('hardware not available in tests');
      },
      serial: async () => {
        throw new Error('hardware not available in tests');
      },
      discover: async () => [],
      test: async () => ({ ok: false, message: 'hardware not available in tests' }),
      exchange: async () => {
        throw new Error('hardware not available in tests');
      },
    },

    realtime: {
      async connect() {
        /* no-op in tests */
      },
      async disconnect() {
        /* no-op in tests */
      },
      async sendEvent() {
        /* no-op in tests */
      },
      async sendHeartbeat() {
        /* no-op in tests */
      },
      async setStatus() {
        /* no-op in tests */
      },
      async getStatus() {
        return { isConnected: false, status: 'offline' as const, posId: null };
      },
    },

    cloud: {
      async request() {
        throw new Error('cloud not available in tests');
      },
      async googleOAuth() {
        throw new Error('cloud not available in tests');
      },
    },

    push: {
      async isSupported() {
        return false;
      },
      async getPermission() {
        return 'unsupported' as const;
      },
      async requestPermission() {
        return 'unsupported' as const;
      },
      async getToken() {
        return null;
      },
      onMessage() {
        return () => undefined;
      },
      async unregister() {
        /* no-op in tests */
      },
    },

    location: {
      async permission() {
        return 'granted' as const;
      },
      async requestPermission() {
        return 'granted' as const;
      },
      async getCurrent() {
        return {
          latitude: -6.2088,
          longitude: 106.8456,
          accuracyMeters: 10,
          capturedAt: new Date().toISOString(),
        };
      },
    },

    backup: {
      async saveToFile() {
        throw new Error('backup not available in tests');
      },
      async openFile() {
        throw new Error('backup not available in tests');
      },
    },

    display: {
      async open() {
        /* no-op in tests */
      },
      async close() {
        /* no-op in tests */
      },
      async isOpen() {
        return false;
      },
    },

    events: {
      on<K extends keyof DeviceBridgeEventMap>(event: K, listener: DeviceBridgeEventMap[K]) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener as (payload: unknown) => void);
        return () => listeners.get(event)?.delete(listener as (payload: unknown) => void);
      },
    },
  };

  return { bridge, engine };
}
