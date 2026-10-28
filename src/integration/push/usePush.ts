'use client';

// Renderer boot hook for FCM push. Mount once in AppRuntime. Gated by the
// `push` module flag and the `push.enabled` KV opt-in; starts foreground
// messaging + backend token registration when enabled.

import { useEffect } from 'react';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { startPush, stopPush } from './manager';

export function usePush(): void {
  const bridge = useBridge();

  useEffect(() => {
    if (!deviceConfig.modules.push) return;
    void startPush(bridge);
    return () => stopPush();
  }, [bridge]);
}
