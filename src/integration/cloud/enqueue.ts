// Orderline enqueue — pulls rows from the registered orderline source and
// inserts them into each cloud destination's job queue (idempotent on sync_id).
// This replaces ai-pos's coupling to its `transactions:create` handler: the
// device app registers a source, and enqueue fans rows out to enabled configs.

import type { DeviceBridge } from '@/platform';
import { getOrderlineSource, listOrderlineSourceTypes, type OrderlineRow } from '../orderline-source';
import { buildSupabaseOrderline } from './supabase/orderline';

export type CloudDestination = 'google' | 'supabase' | 'grist';

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

interface EnqueueResult {
  destination: CloudDestination;
  enqueued: number;
  skipped: number;
  error?: string;
}

/** The sync_id for a row (idempotency key). Supabase uses OL-{order}-{line}. */
function syncIdFor(row: OrderlineRow): string {
  return `OL-${row.order_id ?? ''}-${row.id}`;
}

/** Insert a job row if its sync_id is not already present. Returns true if new. */
async function insertJobIfNew(
  bridge: DeviceBridge,
  table: string,
  configId: string,
  row: OrderlineRow,
  payload: Record<string, unknown>,
  maxAttempts: number
): Promise<boolean> {
  const syncId = syncIdFor(row);
  const existing = await bridge.db.query<{ id: string }>(`SELECT id FROM ${table} WHERE sync_id = ? LIMIT 1`, [syncId]);
  if (existing.length > 0) return false;

  const timestamp = now();
  await bridge.db.execute(
    `INSERT INTO ${table} (id, config_id, order_id, order_line_id, sync_id, action, payload, status, attempt_count, max_attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'insert', ?, 'pending', 0, ?, ?, ?)`,
    [randomHex(16), configId, row.order_id ?? null, row.id, syncId, JSON.stringify(payload), maxAttempts, timestamp, timestamp]
  );
  return true;
}

/** Enqueue order lines for one destination from the registered source. */
export async function enqueueOrderlineJobs(
  bridge: DeviceBridge,
  destination: CloudDestination,
  options?: { sourceType?: string; limit?: number }
): Promise<EnqueueResult> {
  const result: EnqueueResult = { destination, enqueued: 0, skipped: 0 };

  try {
    // Resolve the config table + source.
    const configTable = `${destination}_configs`;
    const jobTable = `${destination}_sync_jobs`;

    const configs = await bridge.db.query<{ id: string; sync_mode: string; is_active: number; max_retries?: number; supabase_url?: string; tenant_id?: string | null; store_id?: string | null; branch_id?: string | null; terminal_id?: string | null }>(
      `SELECT * FROM ${configTable} WHERE is_active = 1 LIMIT 1`
    );
    const config = configs[0];
    if (!config) return { ...result, error: 'No active config' };
    // Supabase config carries max_retries; Google/Grist default to 5.
    const maxAttempts = config.max_retries ?? 5;

    // Resolve the source: explicit type, else the first registered one.
    let resolved = options?.sourceType ? getOrderlineSource(options.sourceType) : null;
    if (!resolved) {
      const firstType = listOrderlineSourceTypes()[0];
      resolved = firstType ? getOrderlineSource(firstType) : null;
    }
    if (!resolved) return { ...result, error: 'No orderline source registered' };

    const rows = await resolved.fetchUnsynced(bridge, { limit: options?.limit ?? 500 });

    for (const row of rows) {
      let payload: Record<string, unknown>;
      if (destination === 'supabase') {
        payload = buildSupabaseOrderline(row as never, {
          tenant_id: config.tenant_id ?? undefined,
          store_id: config.store_id ?? undefined,
          branch_id: config.branch_id ?? undefined,
          terminal_id: config.terminal_id ?? undefined,
        });
      } else {
        payload = { ...row };
      }

      const inserted = await insertJobIfNew(bridge, jobTable, config.id, row, payload, maxAttempts);
      if (inserted) result.enqueued++;
      else result.skipped++;
    }

    if (result.enqueued > 0 && resolved.markEnqueued) {
      await resolved.markEnqueued(bridge, rows);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/** Enqueue for every destination that has an active config. */
export async function enqueueAllDestinations(
  bridge: DeviceBridge,
  options?: { sourceType?: string; limit?: number }
): Promise<EnqueueResult[]> {
  const destinations: CloudDestination[] = ['supabase', 'grist', 'google'];
  const results: EnqueueResult[] = [];
  for (const destination of destinations) {
    results.push(await enqueueOrderlineJobs(bridge, destination, options));
  }
  return results;
}
