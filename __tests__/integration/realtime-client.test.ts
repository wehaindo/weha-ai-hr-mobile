// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { RealtimeClient, type RealtimeSocket } from '@/integration/realtime/realtime-client';

/** A controllable fake socket the test drives. */
function makeFakeSocket() {
  const sent: string[] = [];
  let openCb: (() => void) | null = null;
  let messageCb: ((data: string) => void) | null = null;
  let closeCb: (() => void) | null = null;
  let errorCb: ((err: Error) => void) | null = null;

  const socket: RealtimeSocket = {
    send: (data) => sent.push(data),
    close: () => {},
    onOpen: (cb) => (openCb = cb),
    onMessage: (cb) => (messageCb = cb),
    onClose: (cb) => (closeCb = cb),
    onError: (cb) => (errorCb = cb),
  };

  return {
    socket,
    sent,
    open: () => openCb?.(),
    message: (data: string) => messageCb?.(data),
    close: () => closeCb?.(),
    error: (err: Error) => errorCb?.(err),
  };
}

function parseSent(sent: string[]): Array<{ type: string; payload: Record<string, unknown> }> {
  return sent.map((s) => JSON.parse(s));
}

describe('RealtimeClient', () => {
  it('registers on open with the identity payload', () => {
    const fake = makeFakeSocket();
    const client = new RealtimeClient({ socketFactory: () => fake.socket });
    client.connect('ws://x', { pos_id: 'POS-1', version: '1.0.0' });
    fake.open();

    const messages = parseSent(fake.sent);
    expect(messages[0].type).toBe('register');
    expect(messages[0].payload.pos_id).toBe('POS-1');
    expect(client.getStatus().isConnected).toBe(true);
    expect(client.getStatus().status).toBe('connected');
  });

  it('sends a heartbeat when connected', () => {
    const fake = makeFakeSocket();
    const client = new RealtimeClient({ socketFactory: () => fake.socket, heartbeatIntervalMs: 50 });
    client.connect('ws://x', { pos_id: 'POS-1' });
    fake.open();

    client.sendHeartbeat('online');
    const messages = parseSent(fake.sent);
    const heartbeat = messages.find((m) => m.type === 'heartbeat');
    expect(heartbeat).toBeDefined();
    expect(heartbeat!.payload.status).toBe('online');
  });

  it('queues events while offline and flushes on connect', () => {
    const fake = makeFakeSocket();
    const client = new RealtimeClient({ socketFactory: () => fake.socket });

    // Not connected yet — event is queued, nothing sent.
    client.sendEvent('sale', { total: 100 });
    expect(parseSent(fake.sent).filter((m) => m.type === 'event')).toHaveLength(0);

    client.connect('ws://x', { pos_id: 'POS-1' });
    fake.open();
    // On open the queue is flushed — the event is now sent.
    const events = parseSent(fake.sent).filter((m) => m.type === 'event');
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('caps the offline heartbeat queue at 10', () => {
    const fake = makeFakeSocket();
    const client = new RealtimeClient({ socketFactory: () => fake.socket });
    for (let i = 0; i < 15; i++) client.sendHeartbeat(`s${i}`);
    client.connect('ws://x', { pos_id: 'POS-1' });
    fake.open();

    const heartbeats = parseSent(fake.sent).filter((m) => m.type === 'heartbeat');
    // 10 queued (cap) + the initial flush; the flushed count is at most the cap.
    expect(heartbeats.length).toBeLessThanOrEqual(11);
  });

  it('dedupes commands by command_id and ACKs', async () => {
    const fake = makeFakeSocket();
    const onCommand = vi.fn().mockReturnValue({ ok: true });
    const client = new RealtimeClient({ socketFactory: () => fake.socket, onCommand });
    client.connect('ws://x', { pos_id: 'POS-1' });
    fake.open();

    const cmd = JSON.stringify({ type: 'command', payload: { command_id: 'c1', command: 'lock_pos', payload: {} } });
    fake.message(cmd);
    fake.message(cmd); // duplicate — ignored
    await new Promise((r) => setTimeout(r, 0));

    expect(onCommand).toHaveBeenCalledTimes(1);
    const acks = parseSent(fake.sent).filter((m) => m.type === 'ack');
    // executing + success for the first; no ACK for the duplicate.
    expect(acks.some((a) => a.payload.status === 'success')).toBe(true);
  });

  it('ACKs failed when no handler is registered', async () => {
    const fake = makeFakeSocket();
    const client = new RealtimeClient({ socketFactory: () => fake.socket });
    client.connect('ws://x', { pos_id: 'POS-1' });
    fake.open();

    fake.message(JSON.stringify({ type: 'command', payload: { command_id: 'c1', command: 'unknown' } }));
    await new Promise((r) => setTimeout(r, 0));

    const acks = parseSent(fake.sent).filter((m) => m.type === 'ack');
    expect(acks.some((a) => a.payload.status === 'failed')).toBe(true);
  });

  it('reports status transitions to onStatus', () => {
    const statuses: string[] = [];
    const fake = makeFakeSocket();
    const client = new RealtimeClient({ socketFactory: () => fake.socket, onStatus: (s) => statuses.push(s) });
    client.connect('ws://x', { pos_id: 'POS-1' });
    fake.open();
    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
  });

  it('stops after max reconnect attempts (status failed)', () => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      const fake = makeFakeSocket();
      const client = new RealtimeClient({
        socketFactory: () => fake.socket,
        onStatus: (s) => statuses.push(s),
        maxReconnectAttempts: 2,
        reconnectDelayMs: 1,
      });
      client.connect('ws://x', { pos_id: 'POS-1' });
      fake.open();
      // Close triggers reconnect scheduling.
      fake.close();
      vi.advanceTimersByTime(5);
      fake.close();
      vi.advanceTimersByTime(5);
      fake.close();
      vi.advanceTimersByTime(5);
      expect(statuses).toContain('failed');
    } finally {
      vi.useRealTimers();
    }
  });
});
