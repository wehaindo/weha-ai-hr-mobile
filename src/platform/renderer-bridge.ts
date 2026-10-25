// Shared renderer bridge for web and Capacitor: sql.js in the renderer with
// IndexedDB persistence, device_settings-backed kv, local event emitter.

import { createEngine, type DatabaseEngine } from '../db/engine';
import { IndexedDbBlobStore } from '../db/persistence';
import { runMigrations } from '../db/migrate';
import { frameworkMigrations } from '../db/migrations';
import { RealtimeClient, type RealtimeSocket } from '../integration/realtime/realtime-client';
import { createRendererDisplay } from './renderer-display';
import { createRendererPush } from './renderer-push';
import { createRendererLocation } from './renderer-location';
import type {
  AppInfo,
  CloudRequest,
  CloudResponse,
  DeviceBridge,
  DeviceBridgeEventMap,
  PlatformKind,
  RealtimeConnectOptions,
  RealtimeStatusResult,
} from './bridge';

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

/** Wrap a browser WebSocket in the RealtimeSocket shape the portable client drives. */
function browserSocket(url: string): RealtimeSocket {
  const ws = new WebSocket(url);
  return {
    send: (data) => ws.send(data),
    close: (code) => ws.close(code),
    onOpen: (cb) => ws.addEventListener('open', () => cb()),
    onMessage: (cb) => ws.addEventListener('message', (e) => cb(String(e.data))),
    onClose: (cb) => ws.addEventListener('close', () => cb()),
    onError: (cb) => ws.addEventListener('error', () => cb(new Error('WebSocket error'))),
  };
}

/**
 * Renderer realtime capability (web/Capacitor): the portable client over a
 * browser WebSocket, emitting status/commands on the local bridge emitter.
 */
function createRendererRealtime(emitter: Emitter): DeviceBridge['realtime'] {
  let client: RealtimeClient | null = null;

  const ensureClient = (): RealtimeClient => {
    if (!client) {
      client = new RealtimeClient({
        socketFactory: browserSocket,
        onStatus: (status, error) => emitter.emit('realtime:status', { status, error }),
        onCommand: (command, payload) => emitter.emit('realtime:command', { command, payload }),
      });
    }
    return client;
  };

  return {
    async connect(options: RealtimeConnectOptions): Promise<void> {
      ensureClient().connect(options.url, options.identity);
    },
    async disconnect(): Promise<void> {
      client?.disconnect();
    },
    async sendEvent(eventType, data, severity): Promise<void> {
      ensureClient().sendEvent(eventType, data, severity);
    },
    async sendHeartbeat(status, data): Promise<void> {
      ensureClient().sendHeartbeat(status, data);
    },
    async setStatus(status): Promise<void> {
      ensureClient().setStatus(status as never);
    },
    async getStatus(): Promise<RealtimeStatusResult> {
      return ensureClient().getStatus();
    },
  };
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

    display: createRendererDisplay(),

    print: {
      async raw(): Promise<void> {
        throw new Error('Raw printing requires Electron (use the print pipeline with a network printer adapter)');
      },
    },

    hardware: {
      async openDrawer(): Promise<void> {
        throw new Error('Cash drawer requires Electron (no raw device I/O on web/Capacitor)');
      },
      async serial(): Promise<void> {
        throw new Error('Serial I/O requires Electron');
      },
      async discover() {
        // No device enumeration in the browser.
        return [];
      },
      async test() {
        return { ok: false, message: 'Hardware test requires Electron' };
      },
      async exchange(): Promise<Uint8Array> {
        throw new Error('Device exchange requires Electron (no serial/TCP request-response on web/Capacitor)');
      },
    },

    realtime: createRendererRealtime(emitter),

    push:
      platform === 'capacitor'
        ? createRendererPush('capacitor')
        : platform === 'web'
          ? createRendererPush('web')
          : // Electron uses the preload bridge; defensive no-op if reached here.
            {
              isSupported: async () => false,
              getPermission: async () => 'unsupported' as const,
              requestPermission: async () => 'unsupported' as const,
              getToken: async () => null,
              onMessage: () => () => undefined,
              unregister: async () => undefined,
            },

    location: createRendererLocation(),

    cloud: {
      async request(req: CloudRequest): Promise<CloudResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30000);
        try {
          const init: RequestInit = {
            method: req.method ?? 'GET',
            headers: req.headers,
            signal: controller.signal,
          };
          if (req.formData) {
            // Multipart: let fetch set the boundary (drop any content-type header).
            const headers = { ...(req.headers ?? {}) };
            delete headers['Content-Type'];
            delete headers['content-type'];
            init.headers = headers;
            const form = new FormData();
            for (const part of req.formData) {
              if (part.bytes) {
                const buf = new Uint8Array(part.bytes).buffer;
                form.append(part.name, new Blob([buf], { type: part.contentType ?? 'application/octet-stream' }), part.filename ?? 'file');
              } else {
                form.append(part.name, part.value ?? '');
              }
            }
            init.body = form;
          } else {
            init.body = req.body;
          }
          const res = await fetch(req.url, init);
          const body = await res.text();
          const headers: Record<string, string> = {};
          res.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
          });
          let json: unknown;
          if ((headers['content-type'] ?? '').includes('json') && body) {
            try {
              json = JSON.parse(body);
            } catch {
              /* non-JSON */
            }
          }
          return { ok: res.ok, status: res.status, headers, body, json };
        } finally {
          clearTimeout(timeout);
        }
      },
      async googleOAuth(): Promise<never> {
        throw new Error('Google OAuth requires Electron (a backend or native callback is needed on web)');
      },
    },

    backup: {
      async saveToFile(): Promise<never> {
        throw new Error('Native backup file save requires Electron (use exportJson + download on web)');
      },
      async openFile(): Promise<never> {
        throw new Error('Native backup file open requires Electron (use importJson + upload on web)');
      },
    },

    events: {
      on<K extends keyof DeviceBridgeEventMap>(event: K, listener: DeviceBridgeEventMap[K]): () => void {
        return emitter.on(event, listener as Listener);
      },
    },
  };
}
