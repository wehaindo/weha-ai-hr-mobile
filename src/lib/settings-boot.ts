'use client';

// Boot-time settings application — loads the stored security lockout policy
// into the auth store and runs the retention auto-cleanup once (when enabled).
// Mounted once in AppRuntime so policy + cleanup take effect on every launch.

import { useEffect } from 'react';
import { useBridge, type DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { useAuthStore } from '@/stores/auth';
import { RetentionService } from '@/lib/retention/service';

async function applyBootSettings(bridge: DeviceBridge): Promise<void> {
  // Security: apply the stored lockout policy.
  if (deviceConfig.modules.security) {
    try {
      const maxAttempts = await bridge.kv.get<number>('security.maxLoginAttempts');
      if (typeof maxAttempts === 'number' && maxAttempts >= 1) {
        useAuthStore.getState().configureLockout(maxAttempts, 30000);
      }
    } catch {
      /* keep defaults */
    }
  }

  // Retention: run cleanup once on boot when enabled.
  if (deviceConfig.modules.retention) {
    try {
      const service = new RetentionService(bridge);
      const config = await service.getConfig();
      if (config.enabled) {
        await service.runCleanup(config);
      }
    } catch {
      /* non-fatal */
    }
  }
}

/** Apply stored settings policy + run retention cleanup on boot. */
export function useSettingsBoot(): void {
  const bridge = useBridge();

  useEffect(() => {
    void applyBootSettings(bridge);
  }, [bridge]);
}
