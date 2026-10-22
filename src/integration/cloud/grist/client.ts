// Grist client — record append + table ensure via the Grist API, routing every
// call through `bridge.cloud.request`. Auth via `Authorization: Bearer <token>`.
// Ported from ai-pos's main-process Grist logic, adapted to the bridge.

import type { DeviceBridge } from '@/platform';

export interface GristClientConfig {
  grist_url: string;
  api_token?: string | null;
  doc_id?: string;
  table_id?: string;
}

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** Compute the target table id for a config (daily/monthly modes append a suffix). */
export function getGristTableName(config: Pick<GristClientConfig, 'table_id'> & { table_mode?: string; date?: string }): string {
  const table = config.table_id || 'OrderLines';
  const mode = config.table_mode ?? 'single';
  if (mode === 'daily' && config.date) return `${table}_${config.date}`;
  if (mode === 'monthly' && config.date) return `${table}_${config.date.slice(0, 7)}`;
  return table;
}

/** Append records to a Grist table. Auto-creates the table on 404. */
export async function appendRecords(
  bridge: DeviceBridge,
  config: GristClientConfig,
  tableId: string,
  records: Array<Record<string, unknown>>
): Promise<{ ok: boolean; error?: string; recordIds?: number[] }> {
  if (records.length === 0) return { ok: true, recordIds: [] };
  const url = `${base(config.grist_url)}/api/docs/${config.doc_id}/tables/${tableId}/records`;

  const attempt = () =>
    bridge.cloud.request({
      url,
      method: 'POST',
      headers: authHeaders(config.api_token),
      body: JSON.stringify({ records: records.map((r) => ({ fields: r })) }),
    });

  const res = await attempt();
  if (res.ok) {
    const ids = (res.json?.records ?? []).map((r: { id: number }) => r.id);
    return { ok: true, recordIds: ids };
  }

  // Auto-create the table on 404, then retry once.
  if (res.status === 404) {
    const ensured = await ensureTable(bridge, config, tableId, records[0]);
    if (!ensured.ok) return { ok: false, error: ensured.error ?? 'Failed to create table' };
    const retry = await attempt();
    if (retry.ok) {
      const ids = (retry.json?.records ?? []).map((r: { id: number }) => r.id);
      return { ok: true, recordIds: ids };
    }
    return { ok: false, error: retry.body ?? `HTTP ${retry.status}` };
  }

  return { ok: false, error: res.json?.error ?? res.body ?? `HTTP ${res.status}` };
}

/** Create a Grist table with columns derived from a sample record. */
export async function ensureTable(
  bridge: DeviceBridge,
  config: GristClientConfig,
  tableId: string,
  sample: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const createUrl = `${base(config.grist_url)}/api/docs/${config.doc_id}/tables`;
  const create = await bridge.cloud.request({
    url: createUrl,
    method: 'POST',
    headers: authHeaders(config.api_token),
    body: JSON.stringify({ id: tableId, name: tableId }),
  });
  if (!create.ok && create.status !== 409) {
    return { ok: false, error: create.body ?? `HTTP ${create.status}` };
  }

  // Ensure columns exist (labels match the sample keys).
  const colsUrl = `${base(config.grist_url)}/api/docs/${config.doc_id}/tables/${tableId}/columns`;
  const cols = Object.keys(sample).map((key) => ({ id: key.toLowerCase(), label: key, type: 'Any' }));
  const colRes = await bridge.cloud.request({
    url: colsUrl,
    method: 'POST',
    headers: authHeaders(config.api_token),
    body: JSON.stringify(cols),
  });
  // A 409 (columns already exist) is fine.
  if (!colRes.ok && colRes.status !== 409) {
    return { ok: false, error: colRes.body ?? `HTTP ${colRes.status}` };
  }
  return { ok: true };
}
