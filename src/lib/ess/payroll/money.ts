// IDR money formatting for payroll (BRD §4.2). Amounts arrive as Decimal
// STRINGS from the contract (Decimal(18,2)) — formatted for display only.
// The client never performs arithmetic that feeds back into payroll truth
// (YTD sums are server-computed; BRD §7).

const NUMBER_FORMATTER = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/**
 * Format a Decimal string (or number) as Indonesian Rupiah without decimals:
 * "10250000.00" → "Rp10.250.000". Malformed input renders as "—".
 */
export function formatIdr(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const text = typeof amount === 'number' ? String(amount) : amount.trim();
  if (!DECIMAL_RE.test(text)) return '—';
  const value = Number(text);
  if (!Number.isFinite(value)) return '—';
  // "Rp" prefixed manually — the ICU currency pattern varies by version
  // (some emit a space between symbol and number).
  return `Rp${NUMBER_FORMATTER.format(Math.round(value))}`;
}

/** Signed variant for breakdown rows (deductions shown as "−Rp…"). */
export function formatIdrNegative(amount: string | number | null | undefined): string {
  const formatted = formatIdr(amount);
  return formatted === '—' ? formatted : `−${formatted}`;
}

/** Display-only numeric view (never used for payroll truth). */
export function parseIdrToNumber(amount: string | number | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const text = typeof amount === 'number' ? String(amount) : amount.trim();
  if (!DECIMAL_RE.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
