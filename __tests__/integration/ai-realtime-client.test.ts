import { describe, it, expect, vi } from 'vitest';
import {
  AiRealtimeClient,
  AI_REALTIME_EVENTS,
  type AiRealtimeSocket,
  type AiRealtimeSocketFactory,
  type AiRealtimeEventEnvelope,
} from '@/integration/ai-realtime/client';

class FakeSocket implements AiRealtimeSocket {
  connected = false;
  auth: Record<string, unknown> = {};
  emitted: Array<{ event: string; args: unknown[] }> = [];
  ackResult: Record<string, unknown> = { ok: true, eventId: 'evt_1', status: 'accepted' };
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(
    public readonly url: string,
    options: Record<string, unknown>
  ) {
    this.auth = (options.auth as Record<string, unknown>) ?? {};
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  emit(event: string, ...args: unknown[]): void {
    this.emitted.push({ event, args });
  }

  timeout(): { emitWithAck(event: string, ...args: unknown[]): Promise<unknown> } {
    return {
      emitWithAck: async (event: string, ...args: unknown[]) => {
        this.emitted.push({ event, args });
        return this.ackResult;
      },
    };
  }

  connect(): void {
    /* driven by tests */
  }

  disconnect(): void {
    this.connected = false;
    this.fire('disconnect', 'io client disconnect');
  }

  fire(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }

  publishesOf(type: string): Array<Record<string, unknown>> {
    return this.emitted
      .filter((e) => e.event === 'event:publish')
      .map((e) => e.args[0] as Record<string, unknown>)
      .filter((payload) => payload.type === type);
  }
}

function makeClient(overrides: Partial<ConstructorParameters<typeof AiRealtimeClient>[0]> = {}) {
  const socket = { current: null as FakeSocket | null };
  const factory: AiRealtimeSocketFactory = (url, options) => {
    socket.current = new FakeSocket(url, options);
    return socket.current;
  };
  const client = new AiRealtimeClient(
    {
      url: 'http://localhost:4002',
      token: 'whrt_test_token',
      topic: 'tenant:default:device.events',
      deviceId: 'POS-01',
      heartbeatMs: 60000,
      ...overrides,
    },
    factory
  );
  return { client, socket };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe('AiRealtimeClient', () => {
  it('sends the credential and device labels in the handshake auth', () => {
    const { client, socket } = makeClient();
    client.connect();

    expect(socket.current).not.toBeNull();
    expect(socket.current?.url).toBe('http://localhost:4002');
    expect(socket.current?.auth).toMatchObject({
      token: 'whrt_test_token',
      deviceId: 'POS-01',
      clientId: 'POS-01',
      clientType: 'device-framework',
    });
    expect(client.getStatus()).toBe('connecting');
  });

  it('publishes device.active on connect with the configured topic', async () => {
    const { client, socket } = makeClient();
    client.connect();
    const statuses: string[] = [];
    client.onStatus((status) => statuses.push(status));

    socket.current!.connected = true;
    socket.current!.fire('connect');
    await flush();

    expect(client.getStatus()).toBe('connected');
    expect(statuses).toContain('connected');

    const active = socket.current!.publishesOf(AI_REALTIME_EVENTS.deviceActive);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      topic: 'tenant:default:device.events',
      type: 'device.active',
      data: { deviceId: 'POS-01' },
    });
  });

  it('publishes device.heartbeat on the configured cadence and stops on disconnect', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = makeClient({ heartbeatMs: 60000 });
      client.connect();
      socket.current!.connected = true;
      socket.current!.fire('connect');
      await flush();

      expect(socket.current!.publishesOf(AI_REALTIME_EVENTS.deviceHeartbeat)).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(60000);
      expect(socket.current!.publishesOf(AI_REALTIME_EVENTS.deviceHeartbeat)).toHaveLength(2);

      client.disconnect();
      await vi.advanceTimersByTimeAsync(180000);
      expect(socket.current!.publishesOf(AI_REALTIME_EVENTS.deviceHeartbeat)).toHaveLength(2);
      expect(client.getStatus()).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves publish with the gateway ack', async () => {
    const { client, socket } = makeClient();
    client.connect();
    socket.current!.connected = true;
    socket.current!.fire('connect');
    await flush();

    const result = await client.publish('session.login', { userId: 'u1' });
    expect(result).toEqual({ ok: true, eventId: 'evt_1' });
    expect(socket.current!.emitted.at(-1)).toEqual({
      event: 'event:publish',
      args: [{ topic: 'tenant:default:device.events', type: 'session.login', data: { userId: 'u1' } }],
    });
  });

  it('surfaces a rejected ack', async () => {
    const { client, socket } = makeClient();
    client.connect();
    socket.current!.connected = true;
    socket.current!.fire('connect');
    await flush();

    socket.current!.ackResult = { ok: false, code: 'TOPIC_FORBIDDEN', message: 'Not permitted' };
    const result = await client.publish('device.active', {});
    expect(result).toEqual({ ok: false, code: 'TOPIC_FORBIDDEN', message: 'Not permitted' });
  });

  it('fails publishes while disconnected', async () => {
    const { client } = makeClient();
    client.connect();
    const result = await client.publish('device.active', {});
    expect(result).toEqual({ ok: false, code: 'not_connected' });
  });

  it('subscribes via the legacy event:subscribe surface', async () => {
    const { client, socket } = makeClient();
    client.connect();
    socket.current!.connected = true;
    socket.current!.fire('connect');
    await flush();

    const result = await client.subscribe('tenant:default:device.events');
    expect(result).toEqual({ ok: true });
    expect(socket.current!.emitted.at(-1)).toEqual({
      event: 'event:subscribe',
      args: [{ channel: 'tenant:default:device.events' }],
    });
  });

  it('fans inbound event envelopes out to onEvent handlers', () => {
    const { client, socket } = makeClient();
    client.connect();
    const received: AiRealtimeEventEnvelope[] = [];
    client.onEvent((event) => received.push(event));

    const envelope = {
      eventId: 'evt_9',
      tenantId: 'default',
      appId: 'app',
      topic: 'tenant:default:device.events',
      type: 'command.lock',
      data: {},
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    socket.current!.fire('event', envelope);

    expect(received).toEqual([envelope]);
  });
});
