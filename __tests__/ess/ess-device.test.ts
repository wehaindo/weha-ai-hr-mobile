import { describe, expect, it, vi, afterEach } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { createEssDeviceAdapter, EssDeviceError } from '@/lib/platform/ess-device';
import { createMockEssDeviceAdapter } from '@/lib/platform/ess-device-mock';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ESS device adapter (framework-backed)', () => {
  it('reports the bridge platform and initializes', async () => {
    const { bridge } = await createFakeBridge();
    const adapter = createEssDeviceAdapter(bridge);

    expect(adapter.getPlatform()).toBe('web');
    await expect(adapter.initialize()).resolves.toBeUndefined();

    const info = await adapter.getDeviceInfo();
    expect(info.appName).toBe('test');
    expect(info.platform).toBe('web');
  });

  it('detects notifications only when the Notification API exists', async () => {
    const { bridge } = await createFakeBridge();
    const adapter = createEssDeviceAdapter(bridge);

    vi.stubGlobal('Notification', class FakeNotification {});
    await expect(adapter.getCapabilities()).resolves.toEqual(['notifications']);

    vi.unstubAllGlobals();
    await expect(adapter.getCapabilities()).resolves.toEqual([]);
  });

  it('never reports unsupported capabilities (camera, qr-scan, rfid, fingerprint, location)', async () => {
    const { bridge } = await createFakeBridge();
    vi.stubGlobal('Notification', class FakeNotification {});
    const capabilities = await createEssDeviceAdapter(bridge).getCapabilities();

    for (const missing of ['camera', 'qr-scan', 'rfid', 'fingerprint', 'location'] as const) {
      expect(capabilities).not.toContain(missing);
    }
  });

  it('normalizes init failures into EssDeviceError', async () => {
    const { bridge } = await createFakeBridge();
    const failing = { ...bridge, appInfo: () => Promise.reject(new Error('boom')) };
    const adapter = createEssDeviceAdapter(failing);

    const err = await adapter.initialize().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssDeviceError);
    expect((err as EssDeviceError).code).toBe('init_failed');
    expect((err as EssDeviceError).message).not.toContain('boom');
  });

  it('dispose() removes adapter-managed event listeners', async () => {
    const { bridge } = await createFakeBridge();
    const adapter = createEssDeviceAdapter(bridge);
    const spy = vi.fn();
    adapter.on('db:changed', spy);

    await bridge.db.execute('SELECT 1');
    expect(spy).toHaveBeenCalledTimes(1);

    await adapter.dispose();
    await bridge.db.execute('SELECT 1');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('mock ESS device adapter', () => {
  it('serves deterministic capabilities', async () => {
    const adapter = createMockEssDeviceAdapter({ capabilities: ['camera', 'notifications'] });
    await expect(adapter.getCapabilities()).resolves.toEqual(['camera', 'notifications']);
    expect(adapter.getPlatform()).toBe('web');
  });

  it('supports injected init failures', async () => {
    const adapter = createMockEssDeviceAdapter({ failInitWith: 'simulated failure' });
    const err = await adapter.initialize().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssDeviceError);
    expect((err as EssDeviceError).code).toBe('init_failed');
    expect(adapter.disposed).toBe(false);
  });

  it('tracks and cleans up listeners on dispose', async () => {
    const adapter = createMockEssDeviceAdapter();
    adapter.on('db:changed', () => {});
    adapter.on('sync:status', () => {});
    expect(adapter.remainingListeners()).toBe(2);

    await adapter.dispose();
    expect(adapter.remainingListeners()).toBe(0);
    expect(adapter.disposed).toBe(true);
  });
});
