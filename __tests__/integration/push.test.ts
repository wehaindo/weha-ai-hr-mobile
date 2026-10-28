// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { registerFcmToken } from '@/integration/push/register';
import { getStatus, isPushEnabled, startPush } from '@/integration/push/manager';
import type { CloudRequest, DeviceBridge } from '@/platform';

type RequestMock = ReturnType<typeof vi.fn>;

async function makeBridge(request?: RequestMock) {
  const handle = await createFakeBridge();
  if (request) {
    handle.bridge.cloud.request = request as unknown as DeviceBridge['cloud']['request'];
  }
  return handle;
}

/** Seed an activated ERP integration row (device_token present). */
async function activateDevice(bridge: DeviceBridge, token = 'dev_live_abc'): Promise<void> {
  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO integrations (id, name, kind, config, status, device_token, created_at, updated_at)
     VALUES ('erp', 'WEHA ERP', 'erp', '{}', 'active', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET device_token = excluded.device_token`,
    [token, now, now]
  );
}

function ok() {
  return { ok: true, status: 200, headers: {}, body: '', json: { success: true, data: {} } };
}

function fail(status: number) {
  return { ok: false, status, headers: {}, body: '', json: { success: false } };
}

describe('push register (backend token registration)', () => {
  it('skips when the device is not activated (no device_token)', async () => {
    const request = vi.fn(async () => ok());
    const { bridge } = await makeBridge(request);

    const result = await registerFcmToken(bridge, 'fcm-token-1');

    expect(result.attempted).toBe(false);
    expect(result.registered).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('POSTs the token to /api/device/fcm-token with Bearer auth when activated', async () => {
    let sent: CloudRequest | undefined;
    const request = vi.fn(async (req: CloudRequest) => {
      sent = req;
      return ok();
    });
    const { bridge } = await makeBridge(request);
    await activateDevice(bridge, 'dev_live_secret');

    const result = await registerFcmToken(bridge, 'fcm-token-2');

    expect(result).toEqual({ registered: true, attempted: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sent).toBeDefined();
    expect(sent?.method).toBe('POST');
    expect(sent?.url).toContain('/api/device/fcm-token');
    expect(sent?.headers?.Authorization).toBe('Bearer dev_live_secret');
    expect(JSON.parse(sent?.body ?? '')).toMatchObject({ token: 'fcm-token-2', platform: 'web' });
  });

  it('reports a failed registration on a non-ok response', async () => {
    const request = vi.fn(async () => fail(500));
    const { bridge } = await makeBridge(request);
    await activateDevice(bridge);

    const result = await registerFcmToken(bridge, 'fcm-token-3');

    expect(result).toEqual({ registered: false, attempted: true, message: 'Backend responded 500' });
  });
});

describe('push manager opt-in gate', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('is disabled by default (no push.enabled key)', async () => {
    const { bridge } = await makeBridge();
    expect(await isPushEnabled(bridge)).toBe(false);
  });

  it('startPush is a no-op when push is disabled — does not request a token', async () => {
    const { bridge } = await makeBridge();
    const getToken = vi.fn(async () => 'should-not-be-called');
    bridge.push.getToken = getToken as unknown as DeviceBridge['push']['getToken'];

    const status = await startPush(bridge);

    expect(status.enabled).toBe(false);
    expect(getToken).not.toHaveBeenCalled();
  });

  it('startPush attempts token acquisition when enabled and supported', async () => {
    const { bridge } = await makeBridge();
    await bridge.kv.set('push.enabled', true);
    bridge.push.isSupported = (async () => true) as unknown as DeviceBridge['push']['isSupported'];
    bridge.push.requestPermission = (async () => 'granted') as unknown as DeviceBridge['push']['requestPermission'];
    bridge.push.getToken = (async () => 'fcm-abc') as unknown as DeviceBridge['push']['getToken'];
    // Not activated → registration skipped, but token still persisted.
    bridge.cloud.request = (async () => ok()) as unknown as DeviceBridge['cloud']['request'];

    const status = await startPush(bridge);

    expect(status.enabled).toBe(true);
    expect(status.supported).toBe(true);
    expect(status.token).toBe('fcm-abc');
    expect(await bridge.kv.get<string>('push.fcmToken')).toBe('fcm-abc');
  });

  it('getStatus reflects the persisted token and enabled flag', async () => {
    const { bridge } = await makeBridge();
    await bridge.kv.set('push.enabled', true);
    await bridge.kv.set('push.fcmToken', 'stored-token');
    await bridge.kv.set('push.registeredAt', '2026-01-01T00:00:00.000Z');

    const status = await getStatus(bridge);

    expect(status.enabled).toBe(true);
    expect(status.token).toBe('stored-token');
    expect(status.registeredAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
