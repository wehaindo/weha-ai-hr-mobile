// The DeviceBridge is the single seam between app code and the platform.
// - Electron: implemented over IPC (db lives in the main process)
// - Web / Capacitor: implemented directly in the renderer (sql.js + IndexedDB)
// App code must never touch window.electronAPI or platform globals directly.

import type { SqlStatement } from '../db/engine';
import type { RealtimeIdentity, RealtimeStatus } from '../integration/realtime/realtime-client';

export type { RealtimeIdentity, RealtimeStatus } from '../integration/realtime/realtime-client';

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

/** A device candidate surfaced by hardware discovery (serial port / USB / printer). */
export interface DiscoveredDevice {
  name: string;
  /** Serial port path (e.g. COM3, /dev/ttyUSB0) when applicable. */
  port_path?: string;
  /** Windows printer driver name when applicable. */
  system_name?: string;
  vid?: string;
  pid?: string;
}

/** Serial/USB target: a port path plus baud rate. */
export interface SerialTarget {
  port_path: string;
  baud_rate?: number;
}

export interface HardwareTestResult {
  ok: boolean;
  message?: string;
}

/** A cloud HTTP request performed by the platform (main process on Electron, avoiding CORS). */
export interface CloudRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** Multipart form parts (e.g. Whisper audio upload). Takes precedence over `body`. */
  formData?: Array<{ name: string; filename?: string; bytes?: Uint8Array; contentType?: string; value?: string }>;
  timeoutMs?: number;
}

/** Result of a cloud HTTP request. `body` is the raw text; `json` is parsed when JSON. */
export interface CloudResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: any;
}

/** Result of the Google OAuth authorization-code exchange. */
export interface OAuthTokenResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Options for a request/response exchange over serial/TCP (e.g. ECR terminals). */
export interface ExchangeOptions {
  /** Milliseconds to wait for a complete response packet. Default 60000. */
  timeoutMs?: number;
}

/** Permission state for a device capability (browser permission semantics). */
export type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** A single GNSS/network location fix. */
export interface GeoFix {
  latitude: number;
  longitude: number;
  /** Device-reported accuracy radius in meters (never a guarantee). */
  accuracyMeters: number;
  /** ISO-8601 UTC capture timestamp — the device clock, evidence only. */
  capturedAt: string;
}

export interface LocationOptions {
  /** Milliseconds to wait for a fix. Default 15000. */
  timeoutMs?: number;
}

export interface RealtimeConnectOptions {
  url: string;
  identity: RealtimeIdentity;
}

export interface RealtimeStatusResult {
  isConnected: boolean;
  status: RealtimeStatus;
  posId: string | null;
}

export interface DeviceBridgeEventMap {
  'db:changed': (payload: { tables?: string[] }) => void;
  command: (payload: { command: string; data?: unknown }) => void;
  'window:state': (payload: { maximized: boolean }) => void;
  'sync:status': (payload: { queueDepth: number; online: boolean }) => void;
  'realtime:status': (payload: { status: RealtimeStatus; error?: string }) => void;
  'realtime:command': (payload: { command: string; payload?: unknown }) => void;
  'push:message': (payload: PushMessage) => void;
}

/** A foreground push message delivered while the app is open. */
export interface PushMessage {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

/** Permission state for notifications/push, or 'unsupported' on platforms with no push. */
export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface DeviceBridge {
  readonly platform: PlatformKind;
  appInfo(): Promise<AppInfo>;
  db: {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<void>;
    /** Atomic multi-statement write (no interactive reads inside). */
    batch(statements: SqlStatement[]): Promise<void>;
    /**
     * Persist pending writes immediately, bypassing the engine's save debounce.
     * Auth-critical: a reload right after login must see the written row.
     */
    flush(): Promise<void>;
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
  display: {
    /**
     * Open a display route in a dedicated fullscreen window (external display on
     * Electron; a new tab on web/Capacitor). Tracked by `id` so it can be closed.
     */
    open(id: string, href: string): Promise<void>;
    /** Close the display window opened for `id` (no-op if not open). */
    close(id: string): Promise<void>;
    /** Whether the display for `id` is currently open. */
    isOpen(id: string): Promise<boolean>;
  };
  location: {
    /** Current permission state; 'unsupported' when the platform has no geolocation. */
    permission(): Promise<LocationPermission>;
    /** Request permission at the point of use (triggers the OS/browser prompt). */
    requestPermission(): Promise<'granted' | 'denied'>;
    /**
     * Capture a high-accuracy fix. Rejects with a plain Error carrying a code
     * message: 'permission_denied' | 'timeout' | 'unavailable' | 'unsupported'
     * (plain Error because contextBridge strips prototypes).
     */
    getCurrent(options?: LocationOptions): Promise<GeoFix>;
  };
  print: {
    /** Send raw printer bytes to a network target (host:port, e.g. raw TCP 9100). */
    raw(target: string, bytes: Uint8Array): Promise<void>;
  };
  hardware: {
    /** Open a cash drawer via the ESC/POS pulse command on a network/driver printer target. */
    openDrawer(target: string): Promise<void>;
    /** Send bytes over a serial/USB port. Electron-only; web/Capacitor throw. */
    serial(target: SerialTarget, bytes: Uint8Array): Promise<void>;
    /** Enumerate candidate devices (serial ports / USB printers). Electron-only; web → []. */
    discover(): Promise<DiscoveredDevice[]>;
    /** Connectivity probe for a target (host:port / Windows printer name / port_path). */
    test(target: string): Promise<HardwareTestResult>;
    /**
     * Request/response exchange: send bytes, wait for a complete response packet
     * (ETX-delimited). Used by ECR/payment terminals. Electron-only; web throws.
     */
    exchange(target: SerialTarget | { ip: string; port: number }, bytes: Uint8Array, options?: ExchangeOptions): Promise<Uint8Array>;
  };
  realtime: {
    /** Open the realtime channel to a server. No-op on web if unsupported. */
    connect(options: RealtimeConnectOptions): Promise<void>;
    /** Close the channel and suppress reconnect. */
    disconnect(): Promise<void>;
    /** Emit an event to the server (queued when offline). */
    sendEvent(eventType: string, data: unknown, severity?: string): Promise<void>;
    /** Send a heartbeat with the given status (queued when offline). */
    sendHeartbeat(status?: string, data?: unknown): Promise<void>;
    /** Update the reported device status. */
    setStatus(status: string): Promise<void>;
    /** Current connection state. */
    getStatus(): Promise<RealtimeStatusResult>;
  };
  cloud: {
    /**
     * Perform an HTTP request through the platform (main process on Electron —
     * avoids CORS). On web/Capacitor uses browser fetch (relies on the target
     * supporting CORS, which Google/Supabase/Grist APIs do).
     */
    request(req: CloudRequest): Promise<CloudResponse>;
    /**
     * Run the Google OAuth authorization-code flow: open a window to the
     * authorize URL and capture the redirect code via a localhost callback.
     * Electron-only; web/Capacitor throw (OAuth needs a backend).
     */
    googleOAuth(authorizeUrl: string, options?: { port?: number; timeoutMs?: number }): Promise<OAuthTokenResult>;
  };
  push: {
    /** Whether FCM push is available on this platform (false → app falls back to local notify). */
    isSupported(): Promise<boolean>;
    /** Current notification permission ('unsupported' where push does not exist). */
    getPermission(): Promise<PushPermission>;
    /** Request notification permission; resolves to the resulting state. */
    requestPermission(): Promise<PushPermission>;
    /** Acquire (or reuse) the FCM registration token; null when unavailable/denied. */
    getToken(): Promise<string | null>;
    /** Subscribe to foreground push messages; returns an unsubscribe function. */
    onMessage(listener: (message: PushMessage) => void): () => void;
    /** Delete the FCM registration token and stop push on this device. */
    unregister(): Promise<void>;
  };
  backup: {
    /**
     * Electron: native save dialog + copy the .db file. Returns the chosen path,
     * or null if cancelled. Web/Capacitor throw (use exportJson/importJson).
     */
    saveToFile(): Promise<{ path: string } | null>;
    /**
     * Electron: native open dialog + restore the .db file (writes a safety copy
     * first). Returns the chosen path, or null if cancelled. Web throws.
     */
    openFile(): Promise<{ path: string } | null>;
  };
  events: {
    on<K extends keyof DeviceBridgeEventMap>(event: K, listener: DeviceBridgeEventMap[K]): () => void;
  };
}
