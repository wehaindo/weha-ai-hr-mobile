// Per-entity REST sync core — ported from ai-pos electron/integrations/pos-sync.js
// to framework TS over the async DeviceBridge.db. A device app registers entities
// (see ./entities.ts); each `integration_entities` row is synced against an
// external REST endpoint using its `integration_field_maps`.
//
// Field-map direction semantics:
//   source_field = local column
//   target_field = external field
//   pull: external[target_field] -> local[source_field]
//   push: local[source_field]    -> external[target_field]

import type { DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { getDeviceAuth, type DeviceAuth } from '@/auth/manager';
import { getDeviceServerUrl } from '@/lib/device-server-url';
import { getIntegrationEntityDef, type ResolvedIntegrationEntityDef } from './entities';

export interface IntegrationEntityRow {
  id: string;
  entity_type: string;
  name: string;
  type: string;
  status: string;
  base_url: string;
  api_key: string | null;
  /** How this integration syncs: device auth, the data hub pipeline, or an api_key endpoint. */
  sync_source: 'device' | 'datahub' | 'api_key';
  endpoint: string;
  sync_direction: 'pull' | 'push';
  schedule: string;
  page_size: number;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  push_cursor: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationFieldMapRow {
  id: string;
  integration_entity_id: string;
  entity_type: string;
  source_field: string;
  target_field: string;
  direction: 'both' | 'push' | 'pull';
  transform: string | null;
}

export interface EntitySyncResult {
  pulled: number;
  pushed: number;
  errors: string[];
  pushCursor: string | null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** external record -> local row. */
export function mapPull(record: Record<string, unknown>, fieldMaps: IntegrationFieldMapRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of fieldMaps || []) {
    const ext = m.target_field;
    if (ext && Object.prototype.hasOwnProperty.call(record, ext)) {
      out[m.source_field] = record[ext];
    }
  }
  return out;
}

/** local row -> external payload. */
export function mapPush(row: Record<string, unknown>, fieldMaps: IntegrationFieldMapRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of fieldMaps || []) {
    const pos = m.source_field;
    if (Object.prototype.hasOwnProperty.call(row, pos)) {
      out[m.target_field] = row[pos];
    }
  }
  return out;
}

/** Normalize common list envelopes: array | {data:{items}} | {data:[]} | {records:[]}. */
export function parseItems(json: unknown): Record<string, unknown>[] {
  const j = json as { data?: { items?: unknown[]; total?: number }; total?: unknown; records?: unknown[] } | unknown[];
  if (Array.isArray(j)) return j as Record<string, unknown>[];
  if (j && typeof j === 'object') {
    const obj = j as { data?: { items?: unknown[]; total?: number }; total?: unknown; records?: unknown[] };
    if (obj.data && Array.isArray(obj.data.items)) return obj.data.items as Record<string, unknown>[];
    if (obj.data && Array.isArray(obj.data)) return obj.data as unknown as Record<string, unknown>[];
    if (Array.isArray(obj.records)) return obj.records as Record<string, unknown>[];
  }
  return [];
}

export function buildUrl(baseUrl: string, endpoint: string): string {
  if (!baseUrl) throw new Error('Base URL is not configured');
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const path = (endpoint || '').replace(/^\//, '');
  return new URL(path, base).toString();
}

/** Normalize an API key into an Authorization header (avoid double "Bearer"). */
export function authHeader(apiKey?: string | null): string | null {
  if (!apiKey) return null;
  const value = String(apiKey).trim();
  if (!value) return null;
  return /^bearer\s/i.test(value) ? value : `Bearer ${value}`;
}

interface TableMeta {
  cols: Array<{ name: string; type: string; notnull: boolean; dflt: string | null; pk: boolean }>;
  fks: Array<{ from: string; table: string; to: string }>;
  sql: string | null;
}

const tableMetaCache = new Map<string, TableMeta>();

async function getTableMeta(bridge: DeviceBridge, table: string): Promise<TableMeta> {
  const cached = tableMetaCache.get(table);
  if (cached) return cached;

  const colRows = await bridge.db.query<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>(
    `PRAGMA table_info(${table})`
  );
  const fkRows = await bridge.db.query<{ from: string; table: string; to: string | null }>(
    `PRAGMA foreign_key_list(${table})`
  );
  const sqlRows = await bridge.db.query<{ sql: string | null }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table]
  );

  const meta: TableMeta = {
    cols: colRows.map((c) => ({ name: c.name, type: c.type, notnull: !!c.notnull, dflt: c.dflt_value, pk: !!c.pk })),
    fks: fkRows.map((fk) => ({ from: fk.from, table: fk.table, to: fk.to || 'id' })),
    sql: sqlRows[0]?.sql ?? null,
  };
  tableMetaCache.set(table, meta);
  return meta;
}

/** Clear the table-metadata cache (call after schema changes; used by tests). */
export function clearTableMetaCache(): void {
  tableMetaCache.clear();
}

function coerceValue(value: unknown): unknown {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}

/**
 * A valid literal for a CHECK-constrained column, read from the table's schema
 * (e.g. `category IN ('RAW','FINISHED',…)` → 'RAW'). Lets a pull that doesn't
 * supply the column still satisfy the constraint. Null when there's no usable CHECK.
 */
function checkFallback(sql: string | null, column: string): string | null {
  if (!sql) return null;
  const esc = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inMatch = new RegExp(`CHECK\\s*\\(\\s*"?${esc}"?\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (inMatch) {
    const str = /'((?:[^']|'')*)'/.exec(inMatch[1]);
    if (str) return str[1].replace(/''/g, "'");
    const num = /-?\d+(?:\.\d+)?/.exec(inMatch[1]);
    if (num) return num[0];
    return null;
  }
  const eqMatch = new RegExp(`CHECK\\s*\\(\\s*"?${esc}"?\\s*=\\s*'((?:[^']|'')*)'`, 'i').exec(sql);
  if (eqMatch) return eqMatch[1].replace(/''/g, "'");
  return null;
}

/** Type-based value for a NOT NULL column with no default and no CHECK. */
function typeFallback(declType: string | undefined): unknown {
  const t = (declType ?? '').toUpperCase();
  if (t.includes('INT') || t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 0;
  return '';
}

/**
 * Make a mapped row insertable/updateable: coerce booleans to 1/0, and for NOT
 * NULL foreign-key columns whose value is missing or dangling, fall back to an
 * existing referenced row so the write does not fail.
 */
async function normalizeMapped(
  bridge: DeviceBridge,
  table: string,
  mapped: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const meta = await getTableMeta(bridge, table);
  const fkByFrom = Object.fromEntries(meta.fks.map((fk) => [fk.from, fk]));
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(mapped)) {
    let value = coerceValue(raw);
    const fk = fkByFrom[key];
    if (fk) {
      const exists =
        value !== null &&
        value !== undefined &&
        (await bridge.db.query(`SELECT 1 FROM ${fk.table} WHERE ${fk.to} = ? LIMIT 1`, [value])).length > 0;
      if (!exists) {
        const fallback = await bridge.db.query<{ id: unknown }>(
          `SELECT ${fk.to} AS id FROM ${fk.table} ORDER BY ${fk.to} LIMIT 1`
        );
        if (fallback[0] && fallback[0].id !== undefined && fallback[0].id !== null) {
          value = fallback[0].id;
        }
      }
    }
    out[key] = value;
  }

  return out;
}

async function fetchExternal(
  entity: IntegrationEntityRow,
  fetchImpl: FetchLike,
  deviceAuth?: DeviceAuth | null,
  serverUrl?: string
): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = {};
  let baseUrl: string;
  if (deviceAuth) {
    // Device auth → framework external API `/api/device/{configCode}` (endpoint holds the code).
    headers['Authorization'] = `Bearer ${deviceAuth.token}`;
    baseUrl = buildUrl(serverUrl ?? deviceConfig.erp.baseUrl, `/api/device/${entity.endpoint}`);
  } else {
    const auth = authHeader(entity.api_key);
    if (auth) headers['Authorization'] = auth;
    baseUrl = buildUrl(entity.base_url, entity.endpoint);
  }

  const configured = Number(entity.page_size);
  const pageLimit = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 100;

  const all: Record<string, unknown>[] = [];
  let offset = 0;
  let total: number | null = null;

  for (let page = 0; page < 1000; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set('limit', String(pageLimit));
    url.searchParams.set('offset', String(offset));
    if (deviceAuth && deviceAuth.tenantId) url.searchParams.set('tenantId', deviceAuth.tenantId);

    const res = await fetchImpl(url.toString(), { headers });
    if (!res.ok) {
      if (all.length === 0) throw new Error(`HTTP ${res.status} fetching ${url}`);
      break;
    }

    const json = (await res.json()) as { data?: { total?: number }; total?: number };
    const items = parseItems(json);
    const pageTotal = json && json.data ? json.data.total : json && json.total;
    if (typeof pageTotal === 'number') total = pageTotal;

    all.push(...items);
    offset += items.length;

    if (items.length === 0) break;
    if (total !== null && offset >= total) break;
    if (total === null && items.length < pageLimit) break;
  }

  return all;
}

async function upsertPullRow(
  bridge: DeviceBridge,
  def: ResolvedIntegrationEntityDef,
  mapped: Record<string, unknown>
): Promise<'inserted' | 'updated' | 'skipped'> {
  const keys = def.keys;
  if (keys && keys.length && keys.every((k) => mapped[k] !== undefined && mapped[k] !== null)) {
    const where = keys.map((k) => `${k} = ?`).join(' AND ');
    const vals = keys.map((k) => mapped[k]);
    const existing = await bridge.db.query<{ id: unknown }>(
      `SELECT id FROM ${def.table} WHERE ${where} LIMIT 1`,
      vals
    );
    if (existing[0]) {
      const cols = Object.keys(mapped).filter((c) => !keys.includes(c));
      if (cols.length === 0) return 'skipped';
      const setSql = cols.map((c) => `${c} = ?`).join(', ');
      const setVals = cols.map((c) => mapped[c]);
      await bridge.db.execute(
        `UPDATE ${def.table} SET ${setSql}, updated_at = datetime('now') WHERE id = ?`,
        [...setVals, existing[0].id]
      );
      return 'updated';
    }
  }

  // Nothing mapped → nothing to write (the no-field-maps case stays a no-op).
  if (Object.keys(mapped).length === 0) return 'skipped';

  // Fill NOT NULL columns the response didn't provide so the write can't fail on
  // a missing value. Defaults are left to SQLite; ids and created/updated_at are
  // handled by this statement; CHECK columns get a valid literal from the schema;
  // foreign keys are skipped (they need a real referenced row). Only on INSERT —
  // an UPDATE leaves existing column values untouched.
  const meta = await getTableMeta(bridge, def.table);
  const fkCols = new Set(meta.fks.map((f) => f.from));
  const row: Record<string, unknown> = { ...mapped };
  for (const col of meta.cols) {
    if (col.name in row) continue;
    if (!col.notnull || col.dflt !== null || col.pk) continue;
    if (col.name === 'created_at' || col.name === 'updated_at') continue;
    if (fkCols.has(col.name)) continue;
    const check = checkFallback(meta.sql, col.name);
    row[col.name] = check !== null ? check : typeFallback(col.type);
  }

  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => row[c]);
  await bridge.db.execute(
    `INSERT INTO ${def.table} (${cols.join(', ')}, created_at, updated_at) VALUES (${placeholders}, datetime('now'), datetime('now'))`,
    values
  );
  return 'inserted';
}

/** Run one entity's sync against its external endpoint. */
export async function runEntitySync(params: {
  bridge: DeviceBridge;
  entity: IntegrationEntityRow;
  fieldMaps: IntegrationFieldMapRow[];
  fetchImpl?: FetchLike;
}): Promise<EntitySyncResult> {
  const { bridge, entity, fieldMaps } = params;
  const fetchImpl = params.fetchImpl ?? (fetch as FetchLike);
  const def = getIntegrationEntityDef(entity.entity_type);
  const direction = entity.sync_direction === 'push' ? 'push' : 'pull';
  const errors: string[] = [];
  let pulled = 0;
  let pushed = 0;
  let pushCursor: string | null = null;

  // The data hub pipeline owns `sync_source='datahub'` rows — never run REST for them.
  if (entity.sync_source === 'datahub') {
    return { pulled: 0, pushed: 0, errors: [], pushCursor: null };
  }

  // Device auth → resolve the token+tenant once. This kind needs an activated device.
  const deviceAuth = entity.sync_source === 'device' ? await getDeviceAuth(bridge) : null;
  if (entity.sync_source === 'device' && !deviceAuth) {
    return {
      pulled: 0,
      pushed: 0,
      errors: ['Device not activated — activate it in Settings → Sync first.'],
      pushCursor: null,
    };
  }
  // Device-auth target URL (Sync-page override → env default), resolved once per run.
  const serverUrl = deviceAuth ? await getDeviceServerUrl(bridge) : undefined;

  if (direction === 'pull') {
    try {
      const items = await fetchExternal(entity, fetchImpl, deviceAuth, serverUrl);
      for (const record of items) {
        const ref = record.sku || record.code || record.customer_code || record.name || record.id || '?';
        try {
          const mapped = await normalizeMapped(bridge, def.table, mapPull(record, fieldMaps));
          const naturalKey = def.keys;
          if (naturalKey && naturalKey.length && !naturalKey.every((k) => mapped[k] !== undefined && mapped[k] !== null)) {
            errors.push(`${entity.entity_type}:${ref} missing natural key (${naturalKey.join(', ')})`);
            continue;
          }
          const action = await upsertPullRow(bridge, def, mapped);
          if (action !== 'skipped') pulled++;
        } catch (err) {
          errors.push(`${entity.entity_type}:${ref} ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (direction === 'push') {
    try {
      let cursorMark: string | null = null;
      let rows: Record<string, unknown>[];
      if (def.deltaColumn) {
        // Capture the cursor mark BEFORE reading so rows written while HTTP calls
        // are in flight are picked up next run; the caller persists it only when
        // this run finishes with zero errors (at-least-once + idempotency).
        cursorMark = (await bridge.db.query<{ t: string }>("SELECT datetime('now') AS t"))[0].t;
        rows = await bridge.db.query(
          `SELECT * FROM ${def.table} WHERE ${def.deltaColumn} >= COALESCE(?, '1970-01-01 00:00:00') ORDER BY ${def.deltaColumn} ASC`,
          [entity.push_cursor || '1970-01-01 00:00:00']
        );
      } else {
        rows = await bridge.db.query(`SELECT * FROM ${def.table}`);
      }

      // URL + auth headers differ by kind: device auth → external API + token/tenant.
      let url: string;
      const pushHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (deviceAuth) {
        url = buildUrl(serverUrl ?? deviceConfig.erp.baseUrl, `/api/device/${entity.endpoint}`);
        pushHeaders['Authorization'] = `Bearer ${deviceAuth.token}`;
        if (deviceAuth.tenantId) {
          url += `${url.includes('?') ? '&' : '?'}tenantId=${encodeURIComponent(deviceAuth.tenantId)}`;
        }
      } else {
        url = buildUrl(entity.base_url, entity.endpoint);
        const auth = authHeader(entity.api_key);
        if (auth) pushHeaders['Authorization'] = auth;
      }

      for (const row of rows) {
        try {
          const payload = mapPush(row, fieldMaps);
          if (def.idempotency) {
            payload.idempotency_key = `POS-${entity.entity_type}-${row.id}`;
          }
          const res = await fetchImpl(url, { method: 'POST', headers: pushHeaders, body: JSON.stringify(payload) });
          if (res.ok) pushed++;
          else errors.push(`${entity.entity_type}:${row.id} HTTP ${res.status}`);
        } catch (err) {
          errors.push(`${entity.entity_type}:${row.id} ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (def.deltaColumn) {
        pushCursor = errors.length === 0 ? cursorMark : null;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { pulled, pushed, errors, pushCursor };
}
