// Web/Capacitor location — the renderer half of DeviceBridge.location.
// Browser geolocation is identical on all three platforms (an Electron
// renderer is Chromium too), so the Electron preload mirrors this inline.
// Ported from weha-ai-hrd-mobile (src/platform/renderer-location.ts).

import type { DeviceBridge, GeoFix, LocationPermission } from './bridge';

export const LOCATION_TIMEOUT_MS = 15000;

// GeolocationPositionError codes (DOM constants inlined for robustness).
const GEO_ERROR_PERMISSION_DENIED = 1;
const GEO_ERROR_TIMEOUT = 3;

export function createRendererLocation(): DeviceBridge['location'] {
  const geolocation = () =>
    typeof navigator !== 'undefined' ? navigator.geolocation : undefined;

  return {
    async permission(): Promise<LocationPermission> {
      if (!geolocation()) return 'unsupported';
      // navigator.permissions is missing in some WebViews — fall back to 'prompt'
      // (a fix request triggers the OS prompt anyway).
      try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (status) return status.state as LocationPermission;
      } catch {
        /* probe unsupported */
      }
      return 'prompt';
    },

    async requestPermission(): Promise<'granted' | 'denied'> {
      const geo = geolocation();
      if (!geo) return 'denied';
      // A fix request is what triggers the permission prompt; a non-permission
      // failure (timeout/unavailable) still means permission was granted.
      return new Promise((resolve) => {
        geo.getCurrentPosition(
          () => resolve('granted'),
          (err) => resolve(err.code === GEO_ERROR_PERMISSION_DENIED ? 'denied' : 'granted'),
          { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 }
        );
      });
    },

    async getCurrent(options?: { timeoutMs?: number }): Promise<GeoFix> {
      const geo = geolocation();
      if (!geo) throw new Error('unsupported');
      return new Promise((resolve, reject) => {
        geo.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyMeters: pos.coords.accuracy,
              capturedAt: new Date().toISOString(),
            }),
          (err) => {
            if (err.code === GEO_ERROR_PERMISSION_DENIED) reject(new Error('permission_denied'));
            else if (err.code === GEO_ERROR_TIMEOUT) reject(new Error('timeout'));
            else reject(new Error('unavailable'));
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: options?.timeoutMs ?? LOCATION_TIMEOUT_MS,
          }
        );
      });
    },
  };
}
