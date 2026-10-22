// Grist sync worker — a CloudSyncWorker adapter that maps payloads through the
// config's column maps (label → column), computes the target table (daily/
// monthly modes append a date suffix), and appends records via the Grist API.

import type { DeviceBridge } from '@/platform';
import { CloudSyncWorker, type CloudAdapter } from '../worker';
import { applyColumnMaps } from '../shared';
import { GristConfigService, type GristConfigRow } from './config';
import { appendRecords, getGristTableName } from './client';

function createAdapter(bridge: DeviceBridge): CloudAdapter {
  const configService = new GristConfigService(bridge);

  return {
    configTable: 'grist_configs',
    jobTable: 'grist_sync_jobs',
    logTable: 'grist_sync_logs',
    columnField: 'grist_column',
    columnMapTable: 'grist_column_maps',
    async sendBatch(config, batch) {
      const cfg = config as unknown as GristConfigRow;
      const maps = await configService.listColumnMaps(cfg.id);

      const records = batch.map((item) => {
        const mapped = applyColumnMaps(item.payload, maps);
        // Grist keys records by fields; ensure an id for traceability.
        mapped.id = mapped.id ?? item.syncId;
        return mapped;
      });

      // Compute the target table from the first record's date (daily/monthly).
      const sampleDate = (batch[0]?.payload?.order_date as string) ?? new Date().toISOString();
      const tableId = getGristTableName({ table_id: cfg.table_id, table_mode: cfg.table_mode, date: sampleDate });

      const result = await appendRecords(
        bridge,
        { grist_url: cfg.grist_url, api_token: cfg.api_token, doc_id: cfg.doc_id ?? undefined, table_id: tableId },
        tableId,
        records
      );

      if (result.ok) return batch.map(() => ({ ok: true }));
      return batch.map(() => ({ ok: false, error: result.error ?? 'Append failed' }));
    },
  };
}

let instance: CloudSyncWorker | null = null;

export function getGristSyncWorker(bridge: DeviceBridge): CloudSyncWorker {
  if (!instance) instance = new CloudSyncWorker(bridge, createAdapter(bridge));
  return instance;
}

/** Reset the singleton (mainly for tests, which use a fresh bridge per case). */
export function resetGristSyncWorker(): void {
  instance = null;
}
