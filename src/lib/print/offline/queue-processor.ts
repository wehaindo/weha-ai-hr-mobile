// Offline queue processor — drains pending/retry jobs from the durable
// print_queue table over the DeviceBridge. Because the DB is local, jobs
// survive reloads and are retried with exponential backoff when the printer is
// reachable again.

import type { DeviceBridge } from '@/platform';
import { PrinterAdapter } from '../printer-adapter';
import type { PrintContentItem } from '../escpos-buffer';

export const OFFLINE_RETRY_BASE_MS = 10_000;
export const OFFLINE_RETRY_MAX_MS = 300_000;

export function offlineBackoffMs(attempts: number): number {
  return Math.min(OFFLINE_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)), OFFLINE_RETRY_MAX_MS);
}

interface QueueRow {
  id: number;
  profile_id: string | null;
  doc_type: string;
  payload: string;
  status: string;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

export interface OfflineQueueResult {
  processed: number;
  printed: number;
  failed: number;
  remaining: number;
}

function parseContent(payload: string): PrintContentItem[] {
  if (!payload) return [];
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed)) return parsed as PrintContentItem[];
    if (Array.isArray(parsed?.bytes)) {
      // Stored as raw bytes — not re-renderable content; skip (already bytes).
      return [];
    }
    return [];
  } catch {
    return payload.split('\n').map((line) => ({ type: 'text' as const, value: line }));
  }
}

async function resolveConnectionForProfile(
  bridge: DeviceBridge,
  profileId: string | null
): Promise<ReturnType<typeof PrinterAdapter.resolveConnection>> {
  if (profileId) {
    const rows = await bridge.db.query<{ connection_type: string; connection_config: string }>(
      'SELECT connection_type, connection_config FROM hardware_devices WHERE id = ?',
      [profileId]
    );
    if (rows[0]) return PrinterAdapter.resolveConnection(rows[0].connection_type, rows[0].connection_config);
  }
  return { type: 'windows' };
}

/**
 * Drain pending/retry print jobs through the printer adapter. Jobs store either
 * a content array (re-renderable) or already-compiled bytes in `payload`.
 */
export async function processOfflineQueue(bridge: DeviceBridge, limit = 20): Promise<OfflineQueueResult> {
  const result: OfflineQueueResult = { processed: 0, printed: 0, failed: 0, remaining: 0 };

  const jobs = await bridge.db.query<QueueRow>(
    `SELECT * FROM print_queue WHERE status IN ('pending', 'retry') ORDER BY id ASC LIMIT ?`,
    [limit]
  );

  for (const job of jobs) {
    result.processed++;
    const connection = await resolveConnectionForProfile(bridge, job.profile_id);
    const attempt = job.retry_count + 1;

    try {
      let payload = parseContent(job.payload);
      if (payload.length === 0) {
        // Fall back to raw bytes stored by PrintService.
        const parsed = JSON.parse(job.payload);
        if (Array.isArray(parsed?.bytes)) payload = [];
        const bytes = Uint8Array.from(parsed.bytes ?? []);
        await dispatchRaw(bridge, bytes, connection);
      } else {
        await PrinterAdapter.print(bridge, payload, connection);
      }

      result.printed++;
      await bridge.db.execute("UPDATE print_queue SET status = 'done', printed_at = ?, last_error = NULL WHERE id = ?", [
        new Date().toISOString(),
        job.id,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 3) {
        result.failed++;
        await bridge.db.execute("UPDATE print_queue SET status = 'failed', retry_count = ?, last_error = ? WHERE id = ?", [
          attempt,
          message,
          job.id,
        ]);
      } else {
        result.remaining++;
        await bridge.db.execute("UPDATE print_queue SET status = 'retry', retry_count = ?, last_error = ? WHERE id = ?", [
          attempt,
          message,
          job.id,
        ]);
      }
    }
  }

  return result;
}

async function dispatchRaw(
  bridge: DeviceBridge,
  bytes: Uint8Array,
  connection: ReturnType<typeof PrinterAdapter.resolveConnection>
): Promise<void> {
  if (connection.type === 'serial') {
    await bridge.hardware.serial({ port_path: connection.port_path ?? '', baud_rate: connection.baud_rate }, bytes);
    return;
  }
  const target =
    connection.type === 'network' ? `${connection.ip ?? ''}:${connection.port ?? 9100}` : connection.system_name ?? '';
  await bridge.print.raw(target, bytes);
}
