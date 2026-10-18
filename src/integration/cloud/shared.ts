// Shared cloud-sync helpers — value transforms, batching, date formatting, and
// the column-map model common to Google/Grist/Supabase. Ported from ai-pos's
// per-service helpers (transformValue, chunkArray, date-format) into one module.

/** Split an array into chunks of `size`. */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** A column-map row: maps a POS field to a destination column, with a transform. */
export interface ColumnMap {
  id?: string;
  config_id?: string;
  weha_field: string;
  /** Destination column name (Google: sheet_column, Grist: grist_column, Supabase: supabase_column). */
  column: string;
  column_header?: string | null;
  sequence?: number;
  is_enabled?: number | boolean;
  transform?: string | null;
}

/** Sort enabled maps by sequence. */
export function sortColumnMaps(maps: ColumnMap[]): ColumnMap[] {
  return [...maps]
    .filter((m) => m.is_enabled === 1 || m.is_enabled === true || m.is_enabled === undefined)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

/**
 * Apply a transform to a value. Supported (ai-pos parity):
 *   "multiply:N" | "divide:N" | "toString" | "toNumber" | "toUpperCase" | "toLowerCase"
 * An empty/unknown transform returns the value unchanged.
 */
export function transformValue(value: unknown, transform?: string | null): unknown {
  if (!transform) return value;
  const t = transform.trim();

  if (t.startsWith('multiply:')) {
    const n = Number(t.slice(9));
    return Number.isFinite(n) ? Number(value ?? 0) * n : value;
  }
  if (t.startsWith('divide:')) {
    const n = Number(t.slice(7));
    return Number.isFinite(n) && n !== 0 ? Number(value ?? 0) / n : value;
  }
  switch (t) {
    case 'toString':
      return value === null || value === undefined ? '' : String(value);
    case 'toNumber': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'toUpperCase':
      return value === null || value === undefined ? '' : String(value).toUpperCase();
    case 'toLowerCase':
      return value === null || value === undefined ? '' : String(value).toLowerCase();
    default:
      return value;
  }
}

/** Build a destination payload by applying column maps + transforms to a row. */
export function applyColumnMaps(row: Record<string, unknown>, maps: ColumnMap[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const map of sortColumnMaps(maps)) {
    if (Object.prototype.hasOwnProperty.call(row, map.weha_field)) {
      out[map.column] = transformValue(row[map.weha_field], map.transform);
    }
  }
  return out;
}

// ---- Date helpers (ai-pos date-format.ts, UTC-normalized) ----

/**
 * Parse a sqlite UTC datetime ("YYYY-MM-DD HH:MM:SS") or ISO string into a Date.
 * Treats a bare sqlite datetime as UTC (sqlite `datetime('now')` is UTC).
 */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  // sqlite datetime has a space separator; convert to ISO (T + Z).
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a date as YYYY-MM-DD (local). */
export function formatDate(value: string | null | undefined): string {
  const d = parseUtc(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a date as YYYY-MM-DD HH:MM:SS (local). */
export function formatDateTime(value: string | null | undefined): string {
  const d = parseUtc(value);
  if (!d) return '';
  const date = formatDate(value);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${date} ${hh}:${mm}:${ss}`;
}

/** Format an integer minor-unit (cents) amount as IDR major units. */
export function formatCurrencyIdr(cents: unknown): string {
  const n = Number(cents ?? 0);
  const major = n / 100;
  return major.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Apply a named transform to a field value for a destination row. This is the
 * per-service `prepareRow`/`transformValue` used before upload.
 */
export function transformForDestination(
  field: string,
  value: unknown,
  transform: string | null | undefined
): unknown {
  // Convenience: a "date"/"datetime"/"currency" transform is applied by the
  // destination adapter via its own mapping; here we honor explicit transforms.
  return transformValue(value, transform);
}
