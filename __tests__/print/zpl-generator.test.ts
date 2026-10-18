// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { generateZpl } from '@/lib/print/zpl-generator';
import type { PrintTemplate } from '@/types/print-template';

function labelTemplate(): PrintTemplate {
  return {
    schema_version: '1.0',
    type: 'label',
    paper: { width_mm: 50, height_mm: 30, unit: 'mm' },
    elements: [
      { id: 'name', type: 'text', x: 2, y: 2, width: 46, height: 8, visible: true, variable: 'product.name', fontSize: 12, fontWeight: 'bold', textAlign: 'left' },
      { id: 'barcode', type: 'barcode', x: 2, y: 12, width: 46, height: 15, visible: true, barcodeType: 'code128', variable: 'product.barcode', showText: true },
    ],
    metadata: { name: 'Label', version: '1.0' },
  } as unknown as PrintTemplate;
}

describe('generateZpl', () => {
  it('wraps output in ^XA / ^XZ', () => {
    const result = generateZpl(labelTemplate(), {
      dpi: 203,
      label_width_mm: 50,
      label_height_mm: 30,
      data_context: { product: { name: 'Widget', barcode: '123456789' } },
    });
    expect(result.zpl.startsWith('^XA')).toBe(true);
    expect(result.zpl.trimEnd().endsWith('^XZ')).toBe(true);
  });

  it('sets label size in dots', () => {
    const result = generateZpl(labelTemplate(), {
      dpi: 203,
      label_width_mm: 50,
      label_height_mm: 30,
      data_context: {},
    });
    expect(result.label_width_dots).toBe(Math.round((50 / 25.4) * 203));
    expect(result.zpl).toContain(`^PW${result.label_width_dots}`);
  });

  it('renders resolved text and barcode fields', () => {
    const result = generateZpl(labelTemplate(), {
      dpi: 203,
      label_width_mm: 50,
      label_height_mm: 30,
      data_context: { product: { name: 'Widget', barcode: '123456789' } },
    });
    expect(result.zpl).toContain('Widget');
    expect(result.zpl).toContain('123456789');
  });

  it('skips invisible elements', () => {
    const tmpl = labelTemplate();
    (tmpl.elements[0] as { visible: boolean }).visible = false;
    const result = generateZpl(tmpl, {
      dpi: 203,
      label_width_mm: 50,
      label_height_mm: 30,
      data_context: { product: { name: 'Widget', barcode: '123456789' } },
    });
    expect(result.zpl).not.toContain('Widget');
  });
});
