// Portable realtime WebSocket client core.
//
// Adapted from ai-pos electron/realtime-client.js into framework TS with an
// injected socket factory so the same logic runs in the Electron main process
// (ws) and in the renderer (browser WebSocket). No Electron/Node globals here,
// and no imports — this module is compiled into both the renderer and the
// Electron main bundle (which has no `@/` path alias).

/** Realtime connection status pushed to the app on every state change. */
export type RealtimeStatus = 'offline' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'failed';

/** Identity sent in the realtime `register` handshake. */
export interface RealtimeIdentity {
  pos_id: string;
  pos_name?: string;
  version?: string;
  screen_width?: number;
  screen_height?: number;
  [key: string]: unknown;
}

/** Minimal socket abstraction the client drives. */
export interface RealtimeSocket {
  send(data: string): void;
  close(code?: number): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  onError(cb: (err: Error) => void): void;
}

export type RealtimeSocketFactory = (url: string) => RealtimeSocket;

export interface RealtimeClientOptions {
  socketFactory: RealtimeSocketFactory;
  /** Base heartbeat interval in ms (jittered ±10%). Default 10000. */
  heartbeatIntervalMs?: number;
  /** Max reconnect attempts before giving up. Default 5. */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms; grows ×1.5 capped at 30s. Default 1000. */
  reconnectDelayMs?: number;
  /** Called on every status transition. */
  onStatus?: (status: RealtimeStatus, error?: string) => void;
  /** Called for each server command (after dedupe). Return a result to ACK. */
  onCommand?: (command: string, payload: unknown) => Promise<unknown> | unknown;
}

const HEARTBEAT_QUEUE_CAP = 10;
const EVENT_ID_DEDUPE_CAP = 1000;
const COMMAND_ID_DEDUPE_CAP = 500;
const MAX_RECONNECT_DELAY_MS = 30000;

export class RealtimeClient {
  private socket: RealtimeSocket | null = null;
  private url: string | null = null;
  private identity: RealtimeIdentity | null = null;
  private posId: string | null = null;
  private isConnected = false;
  private intentionalClose = false;
  private status: RealtimeStatus = 'offline';

  private reconnectAttempts = 0;
  private reconnectDelayMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalMs: number;
  private heartbeatQueue: Array<Record<string, unknown>> = [];

  private eventQueue: Array<Record<string, unknown>> = [];
  private processedEventIds = new Set<string>();
  private processedCommandIds = new Set<string>();

  constructor(private options: RealtimeClientOptions) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10000;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
  }

  getStatus(): { isConnected: boolean; status: RealtimeStatus; posId: string | null } {
    return { isConnected: this.isConnected, status: this.status, posId: this.posId };
  }

  connect(url: string, identity: RealtimeIdentity): void {
    if (
      this.url === url &&
      this.posId === identity.pos_id &&
      (this.isConnected || this.socket !== null)
    ) {
      return;
    }

    this.intentionalClose = false;
    this.cleanup();

    this.url = url;
    this.identity = identity;
    this.posId = identity.pos_id;
    this.setStatus('connecting');

    let socket: RealtimeSocket;
    try {
      socket = this.options.socketFactory(url);
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err));
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onOpen(() => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelayMs = this.options.reconnectDelayMs ?? 1000;
      if (this.status === 'offline' || this.status === 'connecting' || this.status === 'reconnecting') {
        this.setStatus('connected');
      }
      this.register();
      this.startHeartbeat();
      this.flushEventQueue();
      this.flushHeartbeatQueue();
    });

    socket.onMessage((raw) => {
      try {
        this.handleMessage(JSON.parse(raw));
      } catch {
        /* ignore malformed frames */
      }
    });

    socket.onClose(() => {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      this.stopHeartbeat();
      this.socket = null;
      if (this.intentionalClose) {
        this.setStatus('disconnected');
        return;
      }
      this.setStatus('disconnected');
      if (wasConnected || this.reconnectAttempts > 0) this.scheduleReconnect();
      else this.scheduleReconnect();
    });

    socket.onError((err) => {
      this.setStatus('error', err.message);
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.reconnectAttempts = 0;
    this.cleanup();
    this.status = 'offline';
    this.heartbeatQueue = [];
    this.setStatus('disconnected');
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.socket) {
      try {
        this.socket.close(1000);
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.isConnected = false;
  }

  private register(): void {
    if (!this.socket || !this.isConnected || !this.identity) return;
    const payload = {
      ...this.identity,
      screen: `${this.identity.screen_width ?? 1920}x${this.identity.screen_height ?? 1080}`,
    };
    this.send({ type: 'register', payload, timestamp: new Date().toISOString() });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.jitteredInterval(this.heartbeatIntervalMs);
    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat(this.status);
      this.startHeartbeat();
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private jitteredInterval(base: number): number {
    const jitter = base * 0.1;
    return base + (Math.random() * 2 - 1) * jitter;
  }

  sendHeartbeat(status?: string, data?: unknown): void {
    const payload: Record<string, unknown> = {
      pos_id: this.posId,
      status: status ?? this.status,
      ...(typeof data === 'object' && data ? data : {}),
      version: this.identity?.version ?? '1.0.0',
      devices: [],
    };
    if (this.isConnected && this.socket) {
      this.send({ type: 'heartbeat', payload, timestamp: new Date().toISOString() });
    } else {
      this.heartbeatQueue.push(payload);
      if (this.heartbeatQueue.length > HEARTBEAT_QUEUE_CAP) this.heartbeatQueue.shift();
    }
  }

  private flushHeartbeatQueue(): void {
    while (this.heartbeatQueue.length > 0) {
      const heartbeat = this.heartbeatQueue.shift()!;
      if (this.socket && this.isConnected) {
        this.send({ type: 'heartbeat', payload: heartbeat, timestamp: new Date().toISOString() });
      } else {
        this.heartbeatQueue.unshift(heartbeat);
        break;
      }
    }
  }

  sendEvent(eventType: string, data: unknown, severity = 'info'): void {
    const eventId = `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const event = { event_id: eventId, event_type: eventType, pos_id: this.posId, data, severity };

    this.processedEventIds.add(eventId);
    if (this.processedEventIds.size > EVENT_ID_DEDUPE_CAP) {
      const first = this.processedEventIds.values().next().value;
      if (first !== undefined) this.processedEventIds.delete(first);
    }

    if (this.isConnected && this.socket) {
      this.send({ type: 'event', payload: event, timestamp: new Date().toISOString() });
    } else {
      this.eventQueue.push(event);
    }
  }

  private flushEventQueue(): void {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      if (this.socket && this.isConnected) {
        this.send({ type: 'event', payload: event, timestamp: new Date().toISOString() });
      } else {
        this.eventQueue.unshift(event);
        break;
      }
    }
  }

  private handleMessage(message: { type?: string; payload?: unknown }): void {
    switch (message.type) {
      case 'command':
        void this.handleCommand(message.payload as Record<string, unknown>);
        break;
      case 'ack':
      case 'error':
      default:
        break;
    }
  }

  private async handleCommand(payload: Record<string, unknown>): Promise<void> {
    const commandId = payload.command_id as string | undefined;
    const command = payload.command as string;
    const commandPayload = payload.payload;

    if (commandId) {
      if (this.processedCommandIds.has(commandId)) return;
      this.processedCommandIds.add(commandId);
      if (this.processedCommandIds.size > COMMAND_ID_DEDUPE_CAP) {
        const first = this.processedCommandIds.values().next().value;
        if (first !== undefined) this.processedCommandIds.delete(first);
      }
    }

    this.sendAck(commandId, 'executing');
    const handler = this.options.onCommand;
    if (handler) {
      try {
        const result = await handler(command, commandPayload);
        this.sendAck(commandId, 'success', result);
      } catch (err) {
        this.sendAck(commandId, 'failed', err instanceof Error ? err.message : String(err));
      }
    } else {
      this.sendAck(commandId, 'failed', 'Command not implemented');
    }
  }

  private sendAck(commandId: string | undefined, status: string, result?: unknown): void {
    if (!this.socket || !this.isConnected) return;
    this.send({ type: 'ack', payload: { command_id: commandId, status, result }, timestamp: new Date().toISOString() });
  }

  setStatus(status: RealtimeStatus, error?: string): void {
    this.status = status;
    this.options.onStatus?.(status, error);
  }

  private send(message: Record<string, unknown>): void {
    if (!this.socket || !this.isConnected) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      /* ignore send failures on a closing socket */
    }
  }

  private scheduleReconnect(): void {
    if (this.options.maxReconnectAttempts !== undefined && this.options.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setStatus('failed');
      return;
    }
    if (!this.url || !this.identity) return;

    const delay = Math.min(this.reconnectDelayMs, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setStatus('reconnecting');
      this.connect(this.url!, this.identity!);
    }, delay);

    // Exponential backoff capped at 30s.
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 1.5, MAX_RECONNECT_DELAY_MS);
  }
}
