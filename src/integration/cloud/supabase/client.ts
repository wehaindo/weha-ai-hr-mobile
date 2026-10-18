// Supabase client — PostgREST upsert with an ensure-table RPC fallback. All
// calls go through `bridge.cloud.request`. Token auth: `apikey` always +
// `Authorization: Bearer` (works for both legacy JWT and publishable keys).
// Ported from ai-pos's main-process Supabase logic, adapted to the bridge.

import type { DeviceBridge } from '@/platform';

export interface SupabaseClientConfig {
  supabase_url: string;
  access_token?: string | null;
  /** Table the records are upserted into (ai-pos uses 'pos_orderlines'). */
  table?: string;
}

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['apikey'] = token;
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Upsert records into a table. Uses `Prefer: resolution=merge-duplicates` so the
 * write is idempotent on `id`. On a "table not found" error, attempts the
 * `ensure_pos_orderlines` RPC then retries once; if the RPC is missing, throws
 * with a TABLE_SETUP_REQUIRED message.
 */
export async function upsertRecords(
  bridge: DeviceBridge,
  config: SupabaseClientConfig,
  records: Array<Record<string, unknown>>
): Promise<{ ok: boolean; error?: string; setupRequired?: boolean }> {
  if (records.length === 0) return { ok: true };
  const table = config.table ?? 'pos_orderlines';
  const url = `${base(config.supabase_url)}/rest/v1/${table}`;

  const attempt = () =>
    bridge.cloud.request({
      url,
      method: 'POST',
      headers: {
        ...authHeaders(config.access_token),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(records),
    });

  const res = await attempt();
  if (res.ok) return { ok: true };

  const body = res.body ?? '';
  const notFound =
    res.status === 404 ||
    body.includes('PGRST205') ||
    body.includes('PGRST202') ||
    body.includes('does not exist') ||
    body.includes('relation');

  if (!notFound) {
    return { ok: false, error: res.json?.message ?? body ?? `HTTP ${res.status}` };
  }

  // Try to create the table via the ensure RPC, then retry once.
  const rpc = await bridge.cloud.request({
    url: `${base(config.supabase_url)}/rest/v1/rpc/ensure_pos_orderlines`,
    method: 'POST',
    headers: { ...authHeaders(config.access_token), 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!rpc.ok) {
    return {
      ok: false,
      setupRequired: true,
      error: 'TABLE_SETUP_REQUIRED: run the Setup SQL once to create the pos_orderlines table + RPC.',
    };
  }

  const retry = await attempt();
  if (retry.ok) return { ok: true };
  return { ok: false, error: retry.json?.message ?? retry.body ?? `HTTP ${retry.status}` };
}

/** Probe connectivity by selecting a single row from the target table. */
export async function testConnection(
  bridge: DeviceBridge,
  config: SupabaseClientConfig
): Promise<{ ok: boolean; error?: string }> {
  const table = config.table ?? 'pos_orderlines';
  const res = await bridge.cloud.request({
    url: `${base(config.supabase_url)}/rest/v1/${table}?select=id&limit=1`,
    method: 'GET',
    headers: authHeaders(config.access_token),
  });
  // A 404 here means the table isn't set up yet — connection itself is fine.
  if (res.ok || res.status === 404) return { ok: true };
  return { ok: false, error: res.json?.message ?? res.body ?? `HTTP ${res.status}` };
}
