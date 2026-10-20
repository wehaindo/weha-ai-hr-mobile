// Socket.IO client for the WEHA AI Realtime gateway (the `ai-realtime`
// repo's apps/gateway). Speaks the gateway contract: authenticated handshake
// with a `whrt_` credential, `event:publish` for outbound events, and
// `event:subscribe` for inbound streams. Portable — runs in the browser
// (web, Capacitor, Electron renderer) with no Node-specific APIs.

import { io } from 'socket.io-client';

export type AiRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface AiRealtimeConfig {
  /** Gateway base URL, e.g. http://localhost:4002 */
  url: string;
  /** `whrt_` application credential (presented directly in the handshake). */
  token: string;
  /** Tenant-scoped topic name, e.g. tenant:weha:device.events */
  topic: string;
  /** Device identity label sent in the handshake and every payload. */
  deviceId?: string;
  /** Cadence for device.heartbeat while connected. Default 60s. */
  heartbeatMs?: number;
  /** Ack wait for a publish. Default 5s. */
  publishTimeoutMs?: number;
}

export interface AiRealtimeEventEnvelope {
  eventId: string;
  tenantId: string;
  appId: string;
  topic: string;
  type: string;
  data: unknown;
  occurredAt: string;
  [key: string]: unknown;
}

export interface AiRealtimePublishResult {
  ok: boolean;
  eventId?: string;
  code?: string;
  message?: string;
}

/** Event types this framework publishes out of the box. */
export const AI_REALTIME_EVENTS = {
  deviceActive: 'device.active',
  deviceHeartbeat: 'device.heartbeat',
  sessionLogin: 'session.login',
  sessionLogout: 'session.logout',
} as const;

/** Minimal Socket.IO surface the client needs (injectable for tests). */
export interface AiRealtimeSocket {
  connected: boolean;
  on(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  timeout(ms: number): { emitWithAck(event: string, ...args: unknown[]): Promise<unknown> };
  connect(): void;
  disconnect(): void;
}

export type AiRealtimeSocketFactory = (
  url: string,
  options: Record<string, unknown>
) => AiRealtimeSocket;

const defaultSocketFactory: AiRealtimeSocketFactory = (url, options) =>
  io(url, options) as unknown as AiRealtimeSocket;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class AiRealtimeClient {
  readonly deviceId: string;

  private readonly socketFactory: AiRealtimeSocketFactory;
  private socket: AiRealtimeSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private status: AiRealtimeStatus = 'idle';
  private readonly statusHandlers = new Set<(status: AiRealtimeStatus) => void>();
  private readonly eventHandlers = new Set<(event: AiRealtimeEventEnvelope) => void>();

  constructor(
    private readonly config: AiRealtimeConfig,
    socketFactory: AiRealtimeSocketFactory = defaultSocketFactory
  ) {
    this.deviceId = config.deviceId ?? 'device-001';
    this.socketFactory = socketFactory;
  }

  getStatus(): AiRealtimeStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Subscribe to connection status changes. Returns an unsubscribe function. */
  onStatus(handler: (status: AiRealtimeStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** Subscribe to inbound `event` envelopes (requires a subscribe() call). */
  onEvent(handler: (event: AiRealtimeEventEnvelope) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /** Opens the Socket.IO connection. Idempotent; reconnection is automatic. */
  connect(): void {
    if (this.socket) return;
    this.setStatus('connecting');

    const socket = this.socketFactory(this.config.url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      timeout: 10000,
      auth: {
        token: this.config.token,
        deviceId: this.deviceId,
        clientId: this.deviceId,
        clientType: 'device-framework',
      },
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.setStatus('connected');
      void this.publish(AI_REALTIME_EVENTS.deviceActive, {
        deviceId: this.deviceId,
        activeAt: new Date().toISOString(),
      });
      this.startHeartbeat();
    });

    socket.on('disconnect', () => {
      this.stopHeartbeat();
      this.setStatus('disconnected');
    });

    socket.on('connect_error', () => {
      this.setStatus('error');
    });

    socket.on('event', (event: unknown) => {
      if (isRecord(event) && typeof event.type === 'string') {
        for (const handler of this.eventHandlers) {
          handler(event as AiRealtimeEventEnvelope);
        }
      }
    });
  }

  /**
   * Publishes one event to the configured topic via `event:publish`.
   * Resolves with the gateway ack; never throws.
   */
  async publish(type: string, data: unknown): Promise<AiRealtimePublishResult> {
    const socket = this.socket;
    if (!socket?.connected) {
      return { ok: false, code: 'not_connected' };
    }
    try {
      const ack = await socket
        .timeout(this.config.publishTimeoutMs ?? 5000)
        .emitWithAck('event:publish', { topic: this.config.topic, type, data });
      if (isRecord(ack) && ack.ok === true) {
        return {
          ok: true,
          eventId: typeof ack.eventId === 'string' ? ack.eventId : undefined,
        };
      }
      return {
        ok: false,
        code: isRecord(ack) && typeof ack.code === 'string' ? ack.code : 'rejected',
        message: isRecord(ack) && typeof ack.message === 'string' ? ack.message : undefined,
      };
    } catch {
      return { ok: false, code: 'timeout' };
    }
  }

  /** Subscribes this connection to a gateway topic/channel for inbound events. */
  async subscribe(channel: string): Promise<{ ok: boolean; code?: string }> {
    const socket = this.socket;
    if (!socket?.connected) {
      return { ok: false, code: 'not_connected' };
    }
    try {
      const ack = await socket.timeout(5000).emitWithAck('event:subscribe', { channel });
      if (isRecord(ack) && ack.ok === true) {
        return { ok: true };
      }
      return {
        ok: false,
        code: isRecord(ack) && typeof ack.code === 'string' ? ack.code : 'rejected',
      };
    } catch {
      return { ok: false, code: 'timeout' };
    }
  }

  /** Closes the connection and stops the heartbeat. Safe to call repeatedly. */
  disconnect(): void {
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('idle');
  }

  private setStatus(status: AiRealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const intervalMs = Math.max(1000, this.config.heartbeatMs ?? 60000);
    void this.publishHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.publishHeartbeat(), intervalMs);
  }

  private publishHeartbeat(): Promise<AiRealtimePublishResult> {
    return this.publish(AI_REALTIME_EVENTS.deviceHeartbeat, {
      deviceId: this.deviceId,
      status: 'online',
      at: new Date().toISOString(),
    });
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
