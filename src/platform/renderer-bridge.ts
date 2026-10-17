// Shared renderer bridge for web and Capacitor: sql.js in the renderer with
// IndexedDB persistence, device_settings-backed kv, local event emitter.

import { createEngine, type DatabaseEngine } from '../db/engine';
import { IndexedDbBlobStore } from '../db/persistence';
import { runMigrations } from '../db/migrate';
import { frameworkMigrations } from '../db/migrations';
import type { AppInfo, DeviceBridge, DeviceBridgeEventMap, PlatformKind } from './bridge';

type Listener = (...args: never[]) => void;

class Emitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (p: unknown) => void)(payload);
    }
  }
}

export async function createRendererBridge(platform: PlatformKind): Promise<DeviceBridge> {
  // sql.js WASM is served from /public (copied by scripts/copy-wasm.mjs).
  const engine: DatabaseEngine = await createEngine(new IndexedDbBlobStore(), () => '/sql-wasm.wasm');
  runMigrations(engine, frameworkMigrations);

  const emitter = new Emitter();
  let dbChangeTimer: ReturnType<typeof setTimeout> | null = null;
  const emitDbChanged = () => {
    if (dbChangeTimer) return;
    dbChangeTimer = setTimeout(() => {
      dbChangeTimer = null;
      emitter.emit('db:changed', {});
    }, 100);
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

  return {
    platform,

    async appInfo(): Promise<AppInfo> {
      return {
        name: process.env.NEXT_PUBLIC_APP_NAME ?? 'Device Framework',
        version: process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0',
        platform,
      };
    },

    db: {
      async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        return engine.query<T>(sql, params);
      },
      async execute(sql: string, params: unknown[] = []): Promise<void> {
        engine.execute(sql, params);
        emitDbChanged();
      },
      async batch(statements): Promise<void> {
        engine.batch(statements);
        emitDbChanged();
      },
    },

    kv: {
      async get<T>(key: string): Promise<T | null> {
        return kvGet<T>(key);
      },
      async set(key: string, value: unknown): Promise<void> {
        engine.execute(
          `INSERT INTO device_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, JSON.stringify(value ?? null), new Date().toISOString()]
        );
      },
      async remove(key: string): Promise<void> {
        engine.execute('DELETE FROM device_settings WHERE key = ?', [key]);
      },
    },

    async notify(title: string, body: string): Promise<void> {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') new Notification(title, { body });
      }
    },

    window: {
      async open(route: string): Promise<void> {
        if (platform === 'web') {
          window.open(route, '_blank', 'noopener');
        }
        // Secondary windows are an Electron concept; Capacitor is single-window.
      },
      async control(): Promise<void> {
        /* no window chrome in web/Capacitor */
      },
    },

    print: {
      async raw(): Promise<void> {
        throw new Error('Raw printing requires Electron (use the print pipeline with a network printer adapter)');
      },
    },

    events: {
      on<K extends keyof DeviceBridgeEventMap>(event: K, listener: DeviceBridgeEventMap[K]): () => void {
        return emitter.on(event, listener as Listener);
      },
    },
  };
}
