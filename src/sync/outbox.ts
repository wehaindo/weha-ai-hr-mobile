// Sync outbox: app code enqueues every local mutation; the engine drains it
// when a connection is available. Nothing is ever lost offline.

import type { DeviceBridge } from '@/platform';

export type SyncAction = 'create' | 'update' | 'delete';
export type OutboxStatus = 'pending' | 'processing' | 'failed' | 'done';

export interface OutboxItem {
  id: number;
  entity_type: string;
  entity_id: string;
  action: SyncAction;
  payload: string | null;
  status: OutboxStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

export interface OutboxStats {
  pending: number;
  processing: number;
  failed: number;
  done: number;
  total: number;
}

export async function enqueueSync(
  bridge: DeviceBridge,
  input: { entityType: string; entityId: string; action: SyncAction; payload?: Record<string, unknown> }
): Promise<void> {
  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO sync_queue (entity_type, entity_id, action, payload, status, retry_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [input.entityType, input.entityId, input.action, input.payload ? JSON.stringify(input.payload) : null, now, now]
  );
}

export async function getOutboxStats(bridge: DeviceBridge): Promise<OutboxStats> {
  const rows = await bridge.db.query<{ status: OutboxStatus; c: number }>(
    'SELECT status, COUNT(*) AS c FROM sync_queue GROUP BY status'
  );
  const stats: OutboxStats = { pending: 0, processing: 0, failed: 0, done: 0, total: 0 };
  for (const row of rows) {
    stats[row.status] = row.c;
    stats.total += row.c;
  }
  return stats;
}

export async function getPendingItems(bridge: DeviceBridge, limit = 50): Promise<OutboxItem[]> {
  return bridge.db.query<OutboxItem>(
    `SELECT id, entity_type, entity_id, action, payload, status, retry_count, last_error, created_at
     FROM sync_queue WHERE status IN ('pending', 'failed') AND retry_count < 5
     ORDER BY id ASC LIMIT ?`,
    [limit]
  );
}

export async function markOutboxStatus(
  bridge: DeviceBridge,
  id: number,
  status: OutboxStatus,
  error?: string
): Promise<void> {
  await bridge.db.execute(
    `UPDATE sync_queue
     SET status = ?, last_error = ?, retry_count = retry_count + CASE WHEN ? = 'failed' THEN 1 ELSE 0 END, updated_at = ?
     WHERE id = ?`,
    [status, error ?? null, status, new Date().toISOString(), id]
  );
}

export async function clearCompleted(bridge: DeviceBridge): Promise<void> {
  await bridge.db.execute("DELETE FROM sync_queue WHERE status = 'done'");
}
