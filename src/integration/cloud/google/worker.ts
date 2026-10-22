// Google Sheets sync worker — a CloudSyncWorker adapter that takes pending
// google_sync_jobs, maps each payload through the config's column maps, and
// appends the resulting rows to the target worksheet in one batch.

import type { DeviceBridge } from '@/platform';
import { CloudSyncWorker, type CloudAdapter } from '../worker';
import { applyColumnMaps, type ColumnMap } from '../shared';
import { GoogleConfigService, type GoogleSheetConfigRow } from './config';

interface GoogleJobRow {
  id: string;
  sync_id: string;
  payload: string;
  action: string;
}

/** Adapter that resolves the account client + config, then appends a batch. */
function createAdapter(bridge: DeviceBridge): CloudAdapter {
  const configService = new GoogleConfigService(bridge);

  return {
    configTable: 'google_sheet_configs',
    jobTable: 'google_sync_jobs',
    logTable: 'google_sync_logs',
    columnField: 'sheet_column',
    columnMapTable: 'google_sheet_column_maps',
    async sendBatch(config, batch) {
      const cfg = config as unknown as GoogleSheetConfigRow;
      if (!cfg.spreadsheet_id) {
        return batch.map(() => ({ ok: false, error: 'No spreadsheet configured' }));
      }

      const client = await configService.createClient(bridge, cfg.google_account_id ?? undefined);
      const maps = await configService.listColumnMaps(cfg.id);
      const range = `${cfg.worksheet_name || 'Order Lines'}!A:Z`;

      // Build one row per job in column-map order.
      const values = batch.map((item) => mapRowToValues(item.payload, maps));

      try {
        const result = await client.appendRows(cfg.spreadsheet_id, range, values);
        // One append covers the whole batch; report success for all.
        void result;
        return batch.map(() => ({ ok: true }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return batch.map(() => ({ ok: false, error: message }));
      }
    },
  };
}

/** Map a payload through the column maps into an ordered row of values. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToValues(payload: Record<string, any>, maps: ColumnMap[]): unknown[] {
  const sorted = [...maps]
    .filter((m) => m.is_enabled === 1 || m.is_enabled === undefined)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const mapped = applyColumnMaps(payload, sorted);
  // Emit values in column-map order (one cell per enabled map).
  return sorted.map((m) => mapped[m.column] ?? '');
}

let instance: CloudSyncWorker | null = null;

export function getGoogleSyncWorker(bridge: DeviceBridge): CloudSyncWorker {
  if (!instance) instance = new CloudSyncWorker(bridge, createAdapter(bridge));
  return instance;
}

/** Reset the singleton (mainly for tests, which use a fresh bridge per case). */
export function resetGoogleSyncWorker(): void {
  instance = null;
}

export type { GoogleJobRow };
