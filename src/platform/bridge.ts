// The DeviceBridge is the single seam between app code and the platform.
// - Electron: implemented over IPC (db lives in the main process)
// - Web / Capacitor: implemented directly in the renderer (sql.js + IndexedDB)
// App code must never touch window.electronAPI or platform globals directly.

import type { SqlStatement } from '../db/engine';

export type PlatformKind = 'electron' | 'capacitor' | 'web';

export interface AppInfo {
  name: string;
  version: string;
  platform: PlatformKind;
  userDataPath?: string;
}

export interface WindowOpenOptions {
  width?: number;
  height?: number;
  fullscreen?: boolean;
  frame?: boolean;
}

export interface DeviceBridgeEventMap {
  'db:changed': (payload: { tables?: string[] }) => void;
  command: (payload: { command: string; data?: unknown }) => void;
  'window:state': (payload: { maximized: boolean }) => void;
  'sync:status': (payload: { queueDepth: number; online: boolean }) => void;
}

export interface DeviceBridge {
  readonly platform: PlatformKind;
  appInfo(): Promise<AppInfo>;
  db: {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<void>;
    /** Atomic multi-statement write (no interactive reads inside). */
    batch(statements: SqlStatement[]): Promise<void>;
  };
  kv: {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
  };
  notify(title: string, body: string): Promise<void>;
  window: {
    open(route: string, options?: WindowOpenOptions): Promise<void>;
    control(action: 'minimize' | 'maximize' | 'restore' | 'close'): Promise<void>;
  };
  print: {
    /** Send raw printer bytes to a network target (host:port, e.g. raw TCP 9100). */
    raw(target: string, bytes: Uint8Array): Promise<void>;
  };
  events: {
    on<K extends keyof DeviceBridgeEventMap>(event: K, listener: DeviceBridgeEventMap[K]): () => void;
  };
}
