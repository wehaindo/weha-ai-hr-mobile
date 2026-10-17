// Date formatting helpers. Timezone/locale default to the browser's; every
// function accepts overrides. Timestamps are stored as ISO UTC strings.

export function getDisplayTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function parseUTC(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  let s = String(value).trim();
  if (!s) return null;
  const isoUTC = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (isoUTC) {
    s = s.replace(' ', 'T');
    if (!s.includes('.')) s += '.000';
    s += 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

interface FormatOpts {
  locale?: string;
  timeZone?: string;
}

function format(value: unknown, options: Intl.DateTimeFormatOptions, opts?: FormatOpts): string {
  const d = parseUTC(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(opts?.locale || undefined, {
    timeZone: opts?.timeZone || getDisplayTimeZone(),
    numberingSystem: 'latn',
    ...options,
  }).format(d);
}

export function toDateKey(value: unknown, timeZone?: string): string {
  const d = parseUTC(value);
  if (!d) return '';
  return format(d, { year: 'numeric', month: '2-digit', day: '2-digit' }, { locale: 'en-CA', timeZone });
}

export function formatDate(value: unknown, opts?: FormatOpts): string {
  const result = format(value, { day: 'numeric', month: 'short', year: 'numeric' }, opts);
  return result || '—';
}

export function formatTime(value: unknown, opts?: FormatOpts): string {
  return format(value, { hour: '2-digit', minute: '2-digit' }, opts);
}

export function formatDateTime(value: unknown, opts?: FormatOpts): string {
  const result = format(
    value,
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    opts
  );
  return result || '—';
}

export function formatDateTimeShort(value: unknown, opts?: FormatOpts): string {
  const result = format(
    value,
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    opts
  );
  return result || '—';
}

export function formatDateLong(value: unknown, opts?: FormatOpts): string {
  const result = format(
    value,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    opts
  );
  return result || '—';
}
