// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chunkArray, transformValue, applyColumnMaps, parseUtc, formatDate, formatDateTime, formatCurrencyIdr, sortColumnMaps, type ColumnMap } from '@/integration/cloud/shared';

describe('chunkArray', () => {
  it('splits into equal chunks', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns empty for empty input', () => {
    expect(chunkArray([], 10)).toEqual([]);
  });

  it('handles size >= length', () => {
    expect(chunkArray([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe('transformValue', () => {
  it('returns the value unchanged for no transform', () => {
    expect(transformValue(5, null)).toBe(5);
    expect(transformValue('x', undefined)).toBe('x');
  });

  it('multiplies and divides', () => {
    expect(transformValue(1000, 'multiply:2')).toBe(2000);
    expect(transformValue(1000, 'divide:100')).toBe(10);
    expect(transformValue(1000, 'divide:0')).toBe(1000); // guard divide-by-zero
  });

  it('converts to string/number/case', () => {
    expect(transformValue(5, 'toString')).toBe('5');
    expect(transformValue('5', 'toNumber')).toBe(5);
    expect(transformValue('abc', 'toUpperCase')).toBe('ABC');
    expect(transformValue('ABC', 'toLowerCase')).toBe('abc');
    expect(transformValue(null, 'toString')).toBe('');
    expect(transformValue('abc', 'toNumber')).toBeNull();
  });

  it('passes through unknown transforms', () => {
    expect(transformValue(7, 'unknown:thing')).toBe(7);
  });
});

describe('sortColumnMaps + applyColumnMaps', () => {
  const maps: ColumnMap[] = [
    { weha_field: 'name', column: 'Title', sequence: 1, is_enabled: 1 },
    { weha_field: 'price', column: 'Cost', sequence: 0, is_enabled: 1, transform: 'divide:100' },
    { weha_field: 'skip', column: 'Skip', sequence: 2, is_enabled: 0 },
  ];

  it('sorts by sequence and filters disabled', () => {
    const sorted = sortColumnMaps(maps);
    expect(sorted.map((m) => m.column)).toEqual(['Cost', 'Title']);
  });

  it('maps + transforms a row into destination columns', () => {
    const out = applyColumnMaps({ name: 'Widget', price: 2500, skip: 'x' }, maps);
    expect(out).toEqual({ Cost: 25, Title: 'Widget' });
  });

  it('omits fields not present in the row', () => {
    const out = applyColumnMaps({ name: 'Widget' }, maps);
    expect(out).toEqual({ Title: 'Widget' });
  });
});

describe('date helpers', () => {
  it('parses a sqlite UTC datetime as UTC', () => {
    const d = parseUtc('2024-01-01 12:00:00');
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toContain('2024-01-01T12:00');
  });

  it('parses an ISO string', () => {
    const d = parseUtc('2024-06-15T10:30:00Z');
    expect(d!.toISOString()).toContain('2024-06-15T10:30');
  });

  it('returns null for empty/invalid', () => {
    expect(parseUtc('')).toBeNull();
    expect(parseUtc(null)).toBeNull();
    expect(parseUtc('not-a-date')).toBeNull();
  });

  it('formats date and datetime', () => {
    expect(formatDate('2024-01-01 05:00:00')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatDateTime('2024-01-01 05:00:00')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(formatDate('')).toBe('');
  });

  it('formats IDR currency from cents', () => {
    expect(formatCurrencyIdr(150000)).toContain('1.500');
    expect(formatCurrencyIdr(0)).toBe('0');
  });
});
