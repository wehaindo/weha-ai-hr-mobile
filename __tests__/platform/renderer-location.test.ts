// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRendererLocation } from '@/platform/renderer-location';

type SuccessCb = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type ErrorCb = (err: { code: number }) => void;

/** Stub navigator.geolocation: resolves a fix, or errors with `code` (1=denied, 2=unavailable, 3=timeout). */
function stubGeolocation(code?: number): void {
  vi.stubGlobal('navigator', {
    ...window.navigator,
    geolocation: {
      getCurrentPosition: vi.fn((success: SuccessCb, error?: ErrorCb) => {
        if (code !== undefined) error?.({ code });
        else success({ coords: { latitude: -6.2088, longitude: 106.8456, accuracy: 12 } });
      }),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderer location (web capability)', () => {
  it('reports unsupported when the platform has no geolocation', async () => {
    vi.stubGlobal('navigator', { ...window.navigator, geolocation: undefined });
    const location = createRendererLocation();

    expect(await location.permission()).toBe('unsupported');
    expect(await location.requestPermission()).toBe('denied');
    await expect(location.getCurrent()).rejects.toThrow('unsupported');
  });

  it('resolves a fix with device-reported accuracy and a UTC capture time', async () => {
    stubGeolocation();
    const location = createRendererLocation();

    const fix = await location.getCurrent({ timeoutMs: 5000 });

    expect(fix.latitude).toBeCloseTo(-6.2088);
    expect(fix.longitude).toBeCloseTo(106.8456);
    expect(fix.accuracyMeters).toBe(12);
    expect(Number.isNaN(Date.parse(fix.capturedAt))).toBe(false);
  });

  it('maps geolocation error codes to bridge error codes', async () => {
    const location = createRendererLocation();

    stubGeolocation(1); // PERMISSION_DENIED
    await expect(location.getCurrent()).rejects.toThrow('permission_denied');

    stubGeolocation(3); // TIMEOUT
    await expect(location.getCurrent()).rejects.toThrow('timeout');

    stubGeolocation(2); // POSITION_UNAVAILABLE
    await expect(location.getCurrent()).rejects.toThrow('unavailable');
  });

  it('requestPermission treats a non-permission failure as granted', async () => {
    stubGeolocation(3); // timeout still implies permission was granted
    const location = createRendererLocation();

    expect(await location.requestPermission()).toBe('granted');
  });

  it('requestPermission returns denied when the fix fails with permission_denied', async () => {
    stubGeolocation(1);
    const location = createRendererLocation();

    expect(await location.requestPermission()).toBe('denied');
  });

  it('permission() falls back to prompt when the Permissions API is missing', async () => {
    stubGeolocation();
    const location = createRendererLocation();

    expect(await location.permission()).toBe('prompt');
  });

  it('permission() reflects a denied Permissions API state', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      geolocation: { getCurrentPosition: vi.fn() },
      permissions: { query: vi.fn(async () => ({ state: 'denied' })) },
    });
    const location = createRendererLocation();

    expect(await location.permission()).toBe('denied');
  });
});
