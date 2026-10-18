'use client';

// Auto-starts the background sync workers: the Data Hub poller and the three
// cloud-destination workers (Google/Supabase/Grist). Each is gated on its module
// flag and only runs when an active config exists. Mount once in AppRuntime.

import { useEffect } from 'react';
import { useBridge, type DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { DatahubSyncWorker, DatahubService } from '@/integration/datahub/sync-worker';
import { getGoogleSyncWorker } from '@/integration/cloud/google/worker';
import { getSupabaseSyncWorker } from '@/integration/cloud/supabase/worker';
import { getGristSyncWorker } from '@/integration/cloud/grist/worker';

/** Whether a destination config is active (enabled + not manual). */
async function hasActiveConfig(bridge: DeviceBridge, table: string): Promise<boolean> {
  try {
    const rows = await bridge.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${table} WHERE is_active = 1 AND sync_mode != 'manual'`
    );
    return (rows[0]?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Mount the background Data Hub + cloud sync workers. */
export function useCloudSyncWorkers(): void {
  const bridge = useBridge();

  useEffect(() => {
    const stops: Array<() => void> = [];
    let cancelled = false;

    void (async () => {
      // Data Hub — start only when enabled and a config exists.
      if (deviceConfig.modules.datahub) {
        try {
          const config = await new DatahubService(bridge).getConfig();
          if (config && config.enabled === 1 && !cancelled) {
            const worker = new DatahubSyncWorker(bridge);
            void worker.start(config.endpoint, config.device_token ?? '');
            stops.push(() => worker.stop());
          }
        } catch {
          /* no datahub config — skip */
        }
      }

      // Cloud destinations — start only when an active, non-manual config exists.
      if (deviceConfig.modules.google && (await hasActiveConfig(bridge, 'google_sheet_configs'))) {
        const worker = getGoogleSyncWorker(bridge);
        worker.start();
        stops.push(() => worker.stop());
      }
      if (deviceConfig.modules.supabase && (await hasActiveConfig(bridge, 'supabase_configs'))) {
        const worker = getSupabaseSyncWorker(bridge);
        worker.start();
        stops.push(() => worker.stop());
      }
      if (deviceConfig.modules.grist && (await hasActiveConfig(bridge, 'grist_configs'))) {
        const worker = getGristSyncWorker(bridge);
        worker.start();
        stops.push(() => worker.stop());
      }

      // Realtime boot auto-connect (web + Capacitor; Electron auto-connects in
      // its own main-process service). Connects when a URL is configured.
      if (deviceConfig.modules.realtime) {
        try {
          const url = await bridge.kv.get<string>('realtime.url');
          if (url && !cancelled) {
            const posId = (await bridge.kv.get<string>('realtime.pos_id')) ?? 'POS-001';
            const posName = (await bridge.kv.get<string>('realtime.pos_name')) ?? 'Device';
            await bridge.realtime.connect({
              url,
              identity: {
                pos_id: posId,
                pos_name: posName,
                version: '1.0.0',
                screen_width: typeof window !== 'undefined' ? window.innerWidth : undefined,
                screen_height: typeof window !== 'undefined' ? window.innerHeight : undefined,
              },
            });
          }
        } catch {
          /* no realtime url — skip */
        }
      }
    })();

    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [bridge]);
}
