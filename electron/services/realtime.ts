// Realtime command channel: persistent websocket to the server; incoming messages
// are broadcast to all windows as `command` events (lock, logout, print_test, …).

import WebSocket from 'ws';
import { getDb } from './database';
import { broadcast } from './window-manager';

let socket: WebSocket | null = null;
let reconnectDelayMs = 5000;

function getRealtimeUrl(): string {
  try {
    const rows = getDb().query<{ value: string }>("SELECT value FROM device_settings WHERE key = 'realtime.url'");
    if (rows.length === 0) return '';
    return JSON.parse(rows[0].value) as string;
  } catch {
    return '';
  }
}

function connect(): void {
  const url = getRealtimeUrl();
  if (!url) return;

  try {
    socket = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.on('open', () => {
    reconnectDelayMs = 5000;
  });

  socket.on('message', (data: { toString(): string }) => {
    try {
      const message = JSON.parse(data.toString());
      broadcast('command', message);
    } catch {
      /* ignore malformed frames */
    }
  });

  socket.on('close', () => scheduleReconnect());
  socket.on('error', () => socket?.close());
}

function scheduleReconnect(): void {
  setTimeout(connect, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60000);
}

export function registerRealtime(): void {
  setTimeout(connect, 3000);
}
