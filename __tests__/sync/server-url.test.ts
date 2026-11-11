// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import deviceConfig from '@/device.config';
import { DEVICE_SERVER_URL_KEY, getDeviceServerUrl, setDeviceServerUrl } from '@/lib/device-server-url';

describe('device server URL (device auth)', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
  });

  it('falls back to the env-derived default when nothing is set', async () => {
    expect(await getDeviceServerUrl(handle.bridge)).toBe(deviceConfig.erp.baseUrl);
  });

  it('returns the stored override', async () => {
    await setDeviceServerUrl(handle.bridge, 'https://other.example.com');
    expect(await getDeviceServerUrl(handle.bridge)).toBe('https://other.example.com');
  });

  it('normalizes on save (trim + no trailing slash)', async () => {
    await setDeviceServerUrl(handle.bridge, '  https://x.example.com/  ');
    expect(await handle.bridge.kv.get<string>(DEVICE_SERVER_URL_KEY)).toBe('https://x.example.com');
    expect(await getDeviceServerUrl(handle.bridge)).toBe('https://x.example.com');
  });

  it('ignores an empty stored value (falls back to the default)', async () => {
    await handle.bridge.kv.set(DEVICE_SERVER_URL_KEY, '   ');
    expect(await getDeviceServerUrl(handle.bridge)).toBe(deviceConfig.erp.baseUrl);
  });
});
