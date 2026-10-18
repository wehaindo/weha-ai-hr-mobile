// Template resolver — find the active receipt/label template for a printer.
// Queries hardware_templates over the DeviceBridge (no electronAPI).

import type { DeviceBridge } from '@/platform';
import type { HardwareTemplate, HardwareTemplateType } from '@/types';

export interface TemplateResolverResult {
  template: HardwareTemplate | null;
  source: 'printer' | 'default' | null;
}

/**
 * Find the active template for a type, preferring one pinned to the printer
 * (assigned_printer_id) and falling back to the default, then the first active.
 */
export async function resolveTemplate(
  bridge: DeviceBridge,
  type: HardwareTemplateType,
  printerId?: string
): Promise<TemplateResolverResult> {
  const templates = await bridge.db.query<HardwareTemplate>(
    'SELECT * FROM hardware_templates WHERE type = ? AND is_active = 1 ORDER BY is_default DESC, name ASC',
    [type]
  );
  if (templates.length === 0) return { template: null, source: null };

  if (printerId) {
    const pinned = templates.find((t) => t.assigned_printer_id === printerId);
    if (pinned) return { template: pinned, source: 'printer' };
  }

  const defaultTemplate = templates.find((t) => t.is_default === 1);
  if (defaultTemplate) return { template: defaultTemplate, source: 'default' };

  return { template: templates[0], source: 'default' };
}

/** Convenience resolver for receipts. */
export async function resolveReceiptTemplate(bridge: DeviceBridge, printerId?: string): Promise<TemplateResolverResult> {
  return resolveTemplate(bridge, 'receipt', printerId);
}

/**
 * Parse a template's content (handles both canonical JSON and legacy direct
 * array formats). Returns the element list plus paper size.
 */
export function parseTemplateContent(template: HardwareTemplate): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements: any[];
  paperWidth: number;
  paperHeight: number | null;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let elements: any[] = [];
  let paperWidth = template.paper_width || 80;
  let paperHeight = template.paper_height ?? null;

  const tryParse = (raw: string | null | undefined): boolean => {
    if (!raw) return false;
    try {
      const content = JSON.parse(raw);
      if (content.elements && Array.isArray(content.elements)) {
        elements = content.elements;
        if (content.paper) {
          paperWidth = content.paper.width_mm || paperWidth;
          paperHeight = content.paper.height_mm;
        }
        return true;
      }
      if (Array.isArray(content)) {
        elements = content;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const parsedCanonical = tryParse(template.template_json);
  if (!parsedCanonical) tryParse(template.content);

  return { elements, paperWidth, paperHeight };
}
