// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderReceipt } from '@/lib/print/receipt-renderer';
import { createDefaultReceiptTemplate } from '@/lib/print/template-schema';
import type { PrintTemplate } from '@/types/print-template';

function template(): PrintTemplate {
  return createDefaultReceiptTemplate() as unknown as PrintTemplate;
}

const DATA = {
  business_name: 'Test Store',
  store_name: 'Branch 1',
  transaction_no: 'T-001',
  created_at: '2024-01-01T10:00:00Z',
  cashier_name: 'Cashier',
  items: [{ product_name: 'Widget', quantity: 2, unit_price_cents: 1000, line_total_cents: 2000 }],
  subtotal_cents: 2000,
  discount_total_cents: 0,
  tax_total_cents: 200,
  total_cents: 2200,
  payments: [{ method: 'cash', amount_cents: 2500 }],
  change_cents: 300,
};

describe('renderReceipt (escpos)', () => {
  it('produces a content array ending with feed + cut', () => {
    const result = renderReceipt(template(), { format: 'escpos', paper_width_mm: 80, data_context: DATA });
    expect(result.format).toBe('escpos');
    const content = result.content as Array<{ type: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[content.length - 2]).toEqual({ type: 'feed', lines: 3 });
    expect(content[content.length - 1]).toEqual({ type: 'cut' });
  });

  it('resolves template variables from the data context', () => {
    const result = renderReceipt(template(), { format: 'escpos', paper_width_mm: 80, data_context: DATA });
    const text = (result.content as Array<{ value?: string }>).map((c) => c.value ?? '').join('\n');
    expect(text).toContain('Test Store');
    expect(text).toContain('T-001');
  });

  it('renders order lines for each item', () => {
    const result = renderReceipt(template(), { format: 'escpos', paper_width_mm: 80, data_context: DATA });
    const text = (result.content as Array<{ value?: string }>).map((c) => c.value ?? '').join('\n');
    expect(text).toContain('Widget');
  });
});

describe('renderReceipt (html)', () => {
  it('produces an HTML string with the store name', () => {
    const result = renderReceipt(template(), { format: 'html', paper_width_mm: 80, data_context: DATA });
    expect(result.format).toBe('html');
    expect(String(result.content)).toContain('Test Store');
    expect(String(result.content)).toContain('class="receipt"');
  });

  it('escapes HTML in dynamic values', () => {
    const withHtml = { ...DATA, business_name: '<script>alert(1)</script>' };
    const result = renderReceipt(template(), { format: 'html', paper_width_mm: 80, data_context: withHtml });
    expect(String(result.content)).not.toContain('<script>alert(1)</script>');
    expect(String(result.content)).toContain('&lt;script&gt;');
  });
});
