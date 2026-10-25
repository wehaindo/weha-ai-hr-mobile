// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRendererLocation } from '@/platform/renderer-location';

interface GeoStub {
  getCurrentPosition: ReturnType<typeof vi.fn>;
}

function stubGeolocation(geo: Partial<GeoStub> | undefined): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: geo,
    configurable: true,
  });
}

function successPosition() {
  return {
    coords: { latitude: -6.2, longitude: 106.8, accuracy: 12 },
    timestamp: Date.now(),
  };
}

function errorPosition(code: number) {
  return { code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

describe('renderer location', () => {
  beforeEach(() => {
    stubGeolocation(undefined);
  });

  it('reports unsupported when the platform has no geolocation', async () => {
    const location = createRendererLocation();
    expect(await location.permission()).toBe('unsupported');
    expect(await location.requestPermission()).toBe('denied');
    await expect(location.getCurrent()).rejects.toThrow('unsupported');
  });

  it('getCurrent resolves a GeoFix from the coordinates', async () => {
    const getCurrentPosition = vi.fn((success: (p: unknown) => void) => success(successPosition()));
    stubGeolocation({ getCurrentPosition });

    const location = createRendererLocation();
    const fix = await location.getCurrent({ timeoutMs: 5000 });

    expect(fix.latitude).toBeCloseTo(-6.2);
    expect(fix.longitude).toBeCloseTo(106.8);
    expect(fix.accuracyMeters).toBe(12);
    expect(typeof fix.capturedAt).toBe('string');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('getCurrent maps a permission-denied error', async () => {
    const getCurrentPosition = vi.fn((_s: unknown, fail: (e: unknown) => void) => fail(errorPosition(1)));
    stubGeolocation({ getCurrentPosition });

    await expect(createRendererLocation().getCurrent()).rejects.toThrow('permission_denied');
  });

  it('getCurrent maps a timeout error', async () => {
    const getCurrentPosition = vi.fn((_s: unknown, fail: (e: unknown) => void) => fail(errorPosition(3)));
    stubGeolocation({ getCurrentPosition });

    await expect(createRendererLocation().getCurrent()).rejects.toThrow('timeout');
  });

  it('getCurrent maps an unavailable error', async () => {
    const getCurrentPosition = vi.fn((_s: unknown, fail: (e: unknown) => void) => fail(errorPosition(2)));
    stubGeolocation({ getCurrentPosition });

    await expect(createRendererLocation().getCurrent()).rejects.toThrow('unavailable');
  });

  it('requestPermission resolves granted on a successful fix', async () => {
    const getCurrentPosition = vi.fn((success: (p: unknown) => void) => success(successPosition()));
    stubGeolocation({ getCurrentPosition });

    expect(await createRendererLocation().requestPermission()).toBe('granted');
  });

  it('requestPermission resolves denied only on a permission error', async () => {
    const getCurrentPosition = vi.fn((_s: unknown, fail: (e: unknown) => void) => fail(errorPosition(1)));
    stubGeolocation({ getCurrentPosition });

    expect(await createRendererLocation().requestPermission()).toBe('denied');
  });
});
