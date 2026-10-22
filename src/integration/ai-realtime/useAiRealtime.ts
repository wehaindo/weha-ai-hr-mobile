'use client';

// Renderer boot hook for the AI Realtime integration. Mount once in
// AppRuntime; connects when a `aiRealtime.token` credential is configured.

import { useEffect } from 'react';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { startAiRealtime, stopAiRealtime } from './manager';

export function useAiRealtime(): void {
  const bridge = useBridge();

  useEffect(() => {
    if (!deviceConfig.modules.aiRealtime) return;
    void startAiRealtime(bridge);
    return () => stopAiRealtime();
  }, [bridge]);
}
