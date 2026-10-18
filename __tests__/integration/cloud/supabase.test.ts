// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateOrderlinePayload } from '@/integration/cloud/supabase/validator';
import { buildSupabaseOrderline } from '@/integration/cloud/supabase/orderline';
import { retryDelaySeconds, nextAttemptAt } from '@/integration/cloud/supabase/requeue';

describe('validateOrderlinePayload', () => {
  const valid = {
    id: 'OL-1-1',
    tenant_id: 't1',
    order_id: '1',
    order_number: 'ORD-1',
    product_name: 'Widget',
    quantity: 2,
    unit_price: 100,
    total: 200,
  };

  it('accepts a valid payload', () => {
    const result = validateOrderlinePayload(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports missing required fields', () => {
    const result = validateOrderlinePayload({ id: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('tenant_id'))).toBe(true);
    expect(result.errors.some((e) => e.includes('product_name'))).toBe(true);
  });

  it('reports non-numeric fields', () => {
    const result = validateOrderlinePayload({ ...valid, quantity: 'abc' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('quantity'))).toBe(true);
  });
});

describe('buildSupabaseOrderline', () => {
  it('builds a record with an idempotent OL-{order}-{line} id', () => {
    const record = buildSupabaseOrderline(
      { order_id: '42', order_number: 'ORD-42', order_line_id: '7', product_name: 'Widget', quantity: 3, unit_price: 500 },
      { tenant_id: 'tenant-a', store_id: 'store-1' }
    );
    expect(record.id).toBe('OL-42-7');
    expect(record.tenant_id).toBe('tenant-a');
    expect(record.store_id).toBe('store-1');
    expect(record.order_id).toBe('42');
  });

  it('derives subtotal as qty × unit_price when not provided', () => {
    const record = buildSupabaseOrderline(
      { order_id: '1', order_number: 'O', order_line_id: '1', product_name: 'X', quantity: 3, unit_price: 500 },
      {}
    );
    expect(record.subtotal).toBe(1500);
    expect(record.total).toBe(1500);
    // tenant falls back to 'default'.
    expect(record.tenant_id).toBe('default');
  });

  it('honors an explicit subtotal/total', () => {
    const record = buildSupabaseOrderline(
      { order_id: '1', order_number: 'O', order_line_id: '1', product_name: 'X', quantity: 1, unit_price: 100, subtotal: 90, total: 90 },
      {}
    );
    expect(record.subtotal).toBe(90);
    expect(record.total).toBe(90);
  });
});

describe('requeue backoff', () => {
  it('doubles the delay per attempt, capped at 15min', () => {
    expect(retryDelaySeconds(1)).toBe(30);
    expect(retryDelaySeconds(2)).toBe(60);
    expect(retryDelaySeconds(3)).toBe(120);
    expect(retryDelaySeconds(10)).toBe(900);
  });

  it('computes a future next-attempt time', () => {
    const from = new Date('2024-01-01T00:00:00Z');
    const next = new Date(nextAttemptAt(1, from));
    expect(next.getTime() - from.getTime()).toBe(30000);
  });
});
