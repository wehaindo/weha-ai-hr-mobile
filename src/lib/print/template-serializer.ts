// Template serializer — designer canvas elements ↔ canonical template JSON.
// PX_PER_MM and ElementData are inlined here so this module stays independent of
// the designer canvas implementation.

/* eslint-disable @typescript-eslint/no-explicit-any */

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pixels per millimeter used by the designer canvas. */
export const PX_PER_MM = 3.78;

/** A designer canvas element in pixel coordinates. */
export interface ElementData {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  variable?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: string;
  visible?: boolean;
  barcodeType?: string;
  condition?: string;
  /** Original canonical element (mm coordinates) — restored verbatim on save. */
  rawElement?: Record<string, any>;
  [key: string]: any;
}

/**
 * Convert a canvas element to a canonical template element (mm coordinates).
 * Position/size always come from the live canvas element (px → mm); any extra
 * type-specific props (columns, fields, showDiscount, …) are preserved.
 */
export function normalizeElement(el: ElementData): Record<string, any> {
  const { id, type, x, y, width, height, visible, rawElement, ...rest } = el as any;
  void rawElement;

  return {
    ...rest,
    id,
    type,
    x: round1((x || 0) / PX_PER_MM),
    y: round1((y || 0) / PX_PER_MM),
    width: round1((width || 40) / PX_PER_MM),
    height: round1((height || 10) / PX_PER_MM),
    visible: visible !== false,
  };
}

export interface BuildTemplateOptions {
  name: string;
  description?: string;
  paperWidth: number;
  paperHeight?: number | null;
  elements: ElementData[];
}

/** Build canonical receipt template JSON (source of truth for ESC/POS + ZPL). */
export function buildReceiptTemplateJson(opts: BuildTemplateOptions): string {
  return JSON.stringify({
    schema_version: '1.0',
    type: 'receipt',
    paper: { width_mm: opts.paperWidth, height_mm: opts.paperHeight ?? null, unit: 'mm' },
    elements: opts.elements.map(normalizeElement),
    metadata: { name: opts.name, description: opts.description || '', version: '1.0' },
  });
}

/** Build canonical label template JSON (dot units, DPI-aware). */
export function buildLabelTemplateJson(
  opts: BuildTemplateOptions & { dpi?: number; zpl?: string }
): string {
  return JSON.stringify({
    schema_version: '1.0',
    type: 'label',
    paper: { width_mm: opts.paperWidth, height_mm: opts.paperHeight ?? null, unit: 'mm' },
    dpi: opts.dpi || 203,
    zpl: opts.zpl || '',
    elements: opts.elements.map(normalizeElement),
    metadata: { name: opts.name, description: opts.description || '', version: '1.0' },
  });
}

/** Deserialize a template JSON string into elements + paper + dpi + zpl. */
export function deserializeTemplateJson(json: string | null | undefined): {
  elements: any[];
  paper: { width_mm: number; height_mm: number | null; unit: string };
  dpi?: number;
  zpl?: string;
} {
  const fallback = { elements: [], paper: { width_mm: 80, height_mm: null, unit: 'mm' } };
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return {
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      paper: {
        width_mm: parsed.paper?.width_mm || 80,
        height_mm: parsed.paper?.height_mm ?? null,
        unit: parsed.paper?.unit || 'mm',
      },
      dpi: parsed.dpi,
      zpl: parsed.zpl,
    };
  } catch {
    return fallback;
  }
}
