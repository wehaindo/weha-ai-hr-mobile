// Register the device's FCM token with the backend (weha-framework) so a sender
// can target this device. Authenticated as the device via the `device` auth
// provider (src/auth/manager.ts) — no credential yet means the device is not
// activated, in which case registration is skipped silently (the local token is
// still kept and will register on a later attempt).

import type { CloudResponse, DeviceBridge } from '@/platform';
import { authRequest, AuthUnavailableError } from '@/auth/manager';
import { getDeviceServerUrl } from '@/lib/device-server-url';

export interface FcmRegistrationResult {
  /** True when a call was made and the backend accepted it. */
  registered: boolean;
  /** False when the device had no activation token (skipped). */
  attempted: boolean;
  message?: string;
}

/**
 * POST the FCM token to `{erp.baseUrl}/api/device/fcm-token`.
 * Returns { attempted:false } when the device is not activated.
 */
export async function registerFcmToken(bridge: DeviceBridge, token: string): Promise<FcmRegistrationResult> {
  let res: CloudResponse;
  try {
    res = await authRequest(bridge, 'device', {
      url: `${await getDeviceServerUrl(bridge)}/api/device/fcm-token`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: bridge.platform }),
      timeoutMs: 15000,
    });
  } catch (err) {
    if (err instanceof AuthUnavailableError) {
      return { registered: false, attempted: false, message: 'Device not activated' };
    }
    throw err;
  }

  if (!res.ok) {
    return {
      registered: false,
      attempted: true,
      message: `Backend responded ${res.status}`,
    };
  }
  return { registered: true, attempted: true };
}
