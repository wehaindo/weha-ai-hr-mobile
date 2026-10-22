// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  validateTemplate,
  isValidTemplate,
  createDefaultReceiptTemplate,
  createDefaultLabelTemplate,
  mmToDots,
  dotsToMm,
} from '@/lib/print/template-schema';

describe('template schema', () => {
  it('accepts the default receipt template', () => {
    const tmpl = createDefaultReceiptTemplate();
    expect(isValidTemplate(tmpl)).toBe(true);
    const result = validateTemplate(tmpl);
    expect(result.success).toBe(true);
  });

  it('accepts the default label template', () => {
    expect(isValidTemplate(createDefaultLabelTemplate())).toBe(true);
  });

  it('rejects a template without a schema_version', () => {
    const tmpl = { ...createDefaultReceiptTemplate() } as Record<string, unknown>;
    delete tmpl.schema_version;
    expect(isValidTemplate(tmpl)).toBe(false);
  });

  it('rejects a template with an invalid paper width', () => {
    const tmpl = {
      ...createDefaultReceiptTemplate(),
      paper: { width_mm: 5, height_mm: null, unit: 'mm' },
    };
    expect(isValidTemplate(tmpl)).toBe(false);
  });

  it('returns readable errors on failure', () => {
    const result = validateTemplate({ schema_version: '1.0' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('DPI conversion', () => {
  it('converts mm to dots at 203 dpi', () => {
    expect(mmToDots(25.4, 203)).toBe(203);
  });

  it('round-trips mm <-> dots', () => {
    expect(Math.round(dotsToMm(mmToDots(50, 203), 203))).toBe(50);
  });
});
