'use client';

import { useEffect } from 'react';
import { useBridge, type DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { SyncEngine } from './engine';

let engine: SyncEngine | null = null;

export function getSyncEngine(bridge: DeviceBridge, config = deviceConfig.erp): SyncEngine {
  if (!engine) engine = new SyncEngine(bridge, config);
  return engine;
}

/** Mounts the background sync loop (poll + outbox drain). */
export function useSyncWorker(): void {
  const bridge = useBridge();

  useEffect(() => {
    if (!deviceConfig.modules.sync) return;
    const syncEngine = getSyncEngine(bridge);
    let cancelled = false;
    syncEngine
      .load()
      .then(() => {
        if (!cancelled) syncEngine.start();
      })
      .catch((err: unknown) => {
        console.error('[sync] failed to load engine:', err);
      });
    return () => {
      cancelled = true;
      syncEngine.stop();
    };
  }, [bridge]);
}
