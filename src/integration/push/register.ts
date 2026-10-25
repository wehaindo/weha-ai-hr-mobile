// Register the device's FCM token with the backend (weha-framework) so a sender
// can target this device. Authenticated with the device token obtained at
// activation (integrations.device_token) — no token yet means the device is not
// activated, in which case registration is skipped silently (the local token is
// still kept and will register on a later attempt).

import type { DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';

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
  const rows = await bridge.db.query<{ device_token: string | null }>(
    "SELECT device_token FROM integrations WHERE kind = 'erp' LIMIT 1"
  );
  const deviceToken = rows[0]?.device_token;
  if (!deviceToken) {
    return { registered: false, attempted: false, message: 'Device not activated' };
  }

  const res = await bridge.cloud.request({
    url: `${deviceConfig.erp.baseUrl}/api/device/fcm-token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({ token, platform: bridge.platform }),
    timeoutMs: 15000,
  });

  if (!res.ok) {
    return {
      registered: false,
      attempted: true,
      message: `Backend responded ${res.status}`,
    };
  }
  return { registered: true, attempted: true };
}
