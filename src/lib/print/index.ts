// Print service — sending goes through the platform bridge. Printers are
// managed by the hardware_devices registry (see the Hardware settings page);
// jobs are recorded in print_queue. The rest of the print stack (templates,
// renderers, ZPL, pipeline, offline queue) is re-exported here for device apps.

import type { DeviceBridge } from '@/platform';
import { PrinterAdapter, type PrinterConnectionConfig } from './printer-adapter';

export * from './escpos-buffer';
export * from './escpos';
export * from './receipt-builder';
export * from './receipt-renderer';
export * from './condition-evaluator';
export * from './template-schema';
export * from './template-serializer';
export * from './template-resolver';
export * from './printer-profile';
export * from './printer-adapter';
export * from './print-pipeline';
export * from './zpl-generator';
export * from './offline/offline-renderer';
export * from './offline/queue-processor';

export type PrintJobStatus = 'pending' | 'done' | 'failed';

export interface PrintJob {
  id: number;
  profile_id: string | null;
  doc_type: string;
  payload: string;
  status: PrintJobStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  printed_at: string | null;
}

function now(): string {
  return new Date().toISOString();
}

/** Route compiled bytes to the right bridge capability by connection type. */
async function dispatchBytes(
  bridge: DeviceBridge,
  bytes: Uint8Array,
  connection: PrinterConnectionConfig
): Promise<void> {
  if (connection.type === 'serial') {
    await bridge.hardware.serial({ port_path: connection.port_path ?? '', baud_rate: connection.baud_rate }, bytes);
    return;
  }
  const target =
    connection.type === 'network' ? `${connection.ip ?? ''}:${connection.port ?? 9100}` : connection.system_name ?? '';
  await bridge.print.raw(target, bytes);
}

export class PrintService {
  constructor(private bridge: DeviceBridge) {}

  // ---- jobs ----

  /** Send bytes to a hardware device (hardware_devices row), handling serial vs network/driver. */
  async printToDevice(deviceId: string, docType: string, bytes: Uint8Array, meta?: Record<string, unknown>): Promise<PrintJob> {
    const device = await this.bridge.db.query<{ id: string; connection_type: string; connection_config: string }>(
      'SELECT * FROM hardware_devices WHERE id = ?',
      [deviceId]
    );
    if (!device[0]) throw new Error('Hardware device not found');

    const connection = PrinterAdapter.resolveConnection(device[0].connection_type, device[0].connection_config);
    const jobId = await this.enqueue(deviceId, docType, bytes, meta);
    try {
      await dispatchBytes(this.bridge, bytes, connection);
      await this.bridge.db.execute("UPDATE print_queue SET status = 'done', printed_at = ?, last_error = NULL WHERE id = ?", [
        now(),
        jobId,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.bridge.db.execute(
        "UPDATE print_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?",
        [message, jobId]
      );
      throw err;
    }
    return this.getJob(jobId);
  }

  async listJobs(limit = 50): Promise<PrintJob[]> {
    return this.bridge.db.query<PrintJob>(
      'SELECT * FROM print_queue ORDER BY id DESC LIMIT ?',
      [limit]
    );
  }

  private async getJob(id: number): Promise<PrintJob> {
    const rows = await this.bridge.db.query<PrintJob>('SELECT * FROM print_queue WHERE id = ?', [id]);
    return rows[0];
  }

  private async enqueue(profileId: string, docType: string, bytes: Uint8Array, meta?: Record<string, unknown>): Promise<number> {
    // Store bytes as an array in JSON payload (small device docs — receipts/labels).
    const payload = JSON.stringify({
      bytes: Array.from(bytes),
      byteLength: bytes.byteLength,
      ...meta,
    });
    await this.bridge.db.execute(
      `INSERT INTO print_queue (profile_id, doc_type, payload, status, retry_count, created_at)
       VALUES (?, ?, ?, 'pending', 0, ?)`,
      [profileId, docType, payload, now()]
    );
    const rows = await this.bridge.db.query<{ id: number }>('SELECT last_insert_rowid() AS id');
    return rows[0].id;
  }
}
