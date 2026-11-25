import type { DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';

// Runtime server URL for DEVICE auth — activation, `/api/device/{configCode}`
// integration calls, and device-token push registration. Editable on
// Settings → Sync, stored in device_settings (kv).
//
// It falls back to the env-derived default (deviceConfig.erp.baseUrl) so an
// already-activated device — or a fresh one that hasn't visited Sync yet — keeps
// working exactly as before. Setting it on the Sync page overrides the default.
//
// Mobile auth intentionally keeps reading the env value directly (unchanged).

export const DEVICE_SERVER_URL_KEY = 'device.serverUrl';

/**
 * Effective device-auth server URL: kv override (Settings → Sync) → `fallback`
 * (the caller's default — `deviceConfig.erp.baseUrl`/env unless overridden).
 * No trailing slash.
 */
export async function getDeviceServerUrl(
  bridge: DeviceBridge,
  fallback: string = deviceConfig.erp.baseUrl
): Promise<string> {
  try {
    const stored = await bridge.kv.get<string>(DEVICE_SERVER_URL_KEY);
    if (stored && stored.trim()) return stored.trim().replace(/\/+$/, '');
  } catch {
    /* fall through to the default */
  }
  return fallback;
}

/** Persist the device-auth server URL (trimmed, no trailing slash). */
export async function setDeviceServerUrl(bridge: DeviceBridge, url: string): Promise<void> {
  await bridge.kv.set(DEVICE_SERVER_URL_KEY, url.trim().replace(/\/+$/, ''));
}
