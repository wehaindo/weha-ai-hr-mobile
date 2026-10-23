import { describe, expect, it } from 'vitest';
import { formatIdr, formatIdrNegative, parseIdrToNumber } from '@/lib/ess/payroll/money';

describe('formatIdr (BRD §4.2 — Indonesian Rupiah, no decimals)', () => {
  it('formats Decimal strings as whole rupiah', () => {
    expect(formatIdr('10250000.00')).toBe('Rp10.250.000');
    expect(formatIdr('450000')).toBe('Rp450.000');
    expect(formatIdr('0.00')).toBe('Rp0');
  });

  it('accepts numbers and handles negatives', () => {
    expect(formatIdr(1500000)).toBe('Rp1.500.000');
    expect(formatIdr('-25000.50')).toContain('25.000');
  });

  it('renders an em dash for missing or malformed amounts', () => {
    expect(formatIdr(null)).toBe('—');
    expect(formatIdr(undefined)).toBe('—');
    expect(formatIdr('')).toBe('—');
    expect(formatIdr('not-money')).toBe('—');
    expect(formatIdr('12.3.4')).toBe('—');
  });

  it('does not lose precision on huge decimals (rounding only at display)', () => {
    expect(formatIdr('9999999999999999.99')).toContain('10.000.000.000.000.000');
  });
});

describe('formatIdrNegative / parseIdrToNumber', () => {
  it('prefixes a minus for deduction rows', () => {
    expect(formatIdrNegative('450000.00')).toBe('−Rp450.000');
    expect(formatIdrNegative(null)).toBe('—');
  });

  it('parses display-only numbers safely', () => {
    expect(parseIdrToNumber('10250000.00')).toBe(10250000);
    expect(parseIdrToNumber(10)).toBe(10);
    expect(parseIdrToNumber('oops')).toBeNull();
    expect(parseIdrToNumber(null)).toBeNull();
  });
});
