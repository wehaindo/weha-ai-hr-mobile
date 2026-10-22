// Realtime command channel — the Electron main-process host of the portable
// RealtimeClient. A persistent WebSocket to an external management server;
// incoming commands are broadcast to all windows as `realtime:command` and
// status changes as `realtime:status`. The client core (queues, dedupe,
// heartbeat, reconnect) lives in src/integration/realtime (shared with web).

import WebSocket from 'ws';
import { RealtimeClient, type RealtimeSocket } from '../../src/integration/realtime/realtime-client';
import type { RealtimeIdentity, RealtimeStatus } from '../../src/integration/realtime/realtime-client';
import { broadcast } from './window-manager';

let client: RealtimeClient | null = null;

/** Wrap a `ws` socket in the RealtimeSocket shape the portable client drives. */
function wsSocket(url: string): RealtimeSocket {
  const socket = new WebSocket(url);
  return {
    send: (data) => socket.send(data),
    close: (code) => socket.close(code),
    onOpen: (cb) => socket.on('open', () => cb()),
    onMessage: (cb) => socket.on('message', (data) => cb(data.toString())),
    onClose: (cb) => socket.on('close', () => cb()),
    onError: (cb) => socket.on('error', (err) => cb(err)),
  };
}

function getClient(): RealtimeClient {
  if (!client) {
    client = new RealtimeClient({
      socketFactory: wsSocket,
      onStatus: (status: RealtimeStatus, error?: string) => broadcast('realtime:status', { status, error }),
      onCommand: (command: string, payload: unknown) => {
        // Fan the command out to every window; the app handles execution.
        broadcast('realtime:command', { command, payload });
        return { forwarded: true };
      },
    });
  }
  return client;
}

export const realtimeService = {
  connect(url: string, identity: RealtimeIdentity): void {
    getClient().connect(url, identity);
  },
  disconnect(): void {
    client?.disconnect();
  },
  sendEvent(eventType: string, data: unknown, severity?: string): void {
    getClient().sendEvent(eventType, data, severity);
  },
  sendHeartbeat(status?: string, data?: unknown): void {
    getClient().sendHeartbeat(status, data);
  },
  setStatus(status: string): void {
    getClient().setStatus(status as RealtimeStatus);
  },
  getStatus(): { isConnected: boolean; status: RealtimeStatus; posId: string | null } {
    return client ? client.getStatus() : { isConnected: false, status: 'offline', posId: null };
  },
};

/**
 * Boot the realtime channel from `device_settings['realtime.url']` if configured.
 * Called at startup after the DB is ready. A missing/empty URL is a no-op.
 */
export function registerRealtime(): void {
  void getRealtimeUrl().then((url) => {
    if (!url) return;
    // Delay initial connect so the window is ready to receive broadcasts.
    setTimeout(() => {
      getClient().connect(url, { pos_id: defaultPosId() });
    }, 3000);
  });
}

async function getRealtimeUrl(): Promise<string> {
  try {
    const { getDb } = await import('./database');
    const rows = getDb().query<{ value: string }>("SELECT value FROM device_settings WHERE key = 'realtime.url'");
    if (rows.length === 0) return '';
    return JSON.parse(rows[0].value) as string;
  } catch {
    return '';
  }
}

function defaultPosId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('os') as typeof import('os');
    return `POS-${os.hostname()}`;
  } catch {
    return 'POS-UNKNOWN';
  }
}
