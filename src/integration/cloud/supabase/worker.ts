// Supabase sync worker — a CloudSyncWorker adapter that validates each payload
// before upload, maps via column maps (or forwards all keys when none), and
// upserts the batch via PostgREST. Invalid rows fail fast (VALIDATION_ERROR).

import type { DeviceBridge } from '@/platform';
import { CloudSyncWorker, type CloudAdapter } from '../worker';
import { applyColumnMaps } from '../shared';
import { SupabaseConfigService, type SupabaseConfigRow } from './config';
import { upsertRecords } from './client';
import { validateOrderlinePayload } from './validator';

function createAdapter(bridge: DeviceBridge): CloudAdapter {
  const configService = new SupabaseConfigService(bridge);

  return {
    configTable: 'supabase_configs',
    jobTable: 'supabase_sync_jobs',
    logTable: 'supabase_sync_logs',
    columnField: 'supabase_column',
    columnMapTable: 'supabase_column_maps',
    async sendBatch(config, batch) {
      const cfg = config as unknown as SupabaseConfigRow;

      // Pre-flight validation: invalid rows fail immediately.
      const invalid = new Map<string, string>();
      for (const item of batch) {
        const validation = validateOrderlinePayload(item.payload);
        if (!validation.valid) invalid.set(item.id, `VALIDATION_ERROR: ${validation.errors.join('; ')}`);
      }

      const valid = batch.filter((item) => !invalid.has(item.id));
      const results: Array<{ ok: boolean; error?: string }> = batch.map((item) => {
        const err = invalid.get(item.id);
        return err ? { ok: false, error: err } : { ok: false, error: 'Not sent' };
      });

      if (valid.length > 0) {
        const maps = await configService.listColumnMaps(cfg.id);
        const records = valid.map((item) => {
          const mapped = maps.length > 0 ? applyColumnMaps(item.payload, maps) : { ...item.payload };
          // Force the idempotent upsert key.
          mapped.id = mapped.id ?? item.syncId;
          return mapped;
        });

        const result = await upsertRecords(bridge, {
          supabase_url: cfg.supabase_url,
          access_token: cfg.access_token,
        }, records);

        for (const item of valid) {
          const idx = batch.findIndex((b) => b.id === item.id);
          results[idx] = result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Upsert failed' };
        }
      }

      return results;
    },
  };
}

let instance: CloudSyncWorker | null = null;

export function getSupabaseSyncWorker(bridge: DeviceBridge): CloudSyncWorker {
  if (!instance) instance = new CloudSyncWorker(bridge, createAdapter(bridge));
  return instance;
}

/** Reset the singleton (mainly for tests, which use a fresh bridge per case). */
export function resetSupabaseSyncWorker(): void {
  instance = null;
}
