// Offline renderer — render a stored template without network. In this
// framework the SQLite DB is local and offline-first, so a template is always
// available by id; no separate cache is required (unlike ai-pos's IndexedDB).

import type { DeviceBridge } from '@/platform';
import type { PrintTemplate, PrintTemplateType } from '@/types/print-template';
import { renderReceipt } from '../receipt-renderer';
import { generateZpl } from '../zpl-generator';
import { parseTemplateContent } from '../template-resolver';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OfflineRenderOptions {
  format: 'html' | 'escpos' | 'zpl';
  data_context: Record<string, any>;
  dpi?: 203 | 300 | 600;
  label_height_mm?: number;
}

export interface OfflineRenderResult {
  success: boolean;
  content?: string | any[];
  format?: string;
  error?: string;
}

export async function renderOfflineTemplate(
  bridge: DeviceBridge,
  templateId: string,
  options: OfflineRenderOptions
): Promise<OfflineRenderResult> {
  const rows = await bridge.db.query<{
    id: string;
    name: string;
    type: string;
    paper_width: number;
    paper_height: number | null;
    template_json: string | null;
    content: string;
    version: number;
  }>('SELECT * FROM hardware_templates WHERE id = ?', [templateId]);

  const cached = rows[0];
  if (!cached) return { success: false, error: `Template ${templateId} not found` };

  const { elements } = parseTemplateContent(cached as never);
  const template: PrintTemplate = {
    schema_version: '1.0',
    type: cached.type as PrintTemplateType,
    paper: { width_mm: cached.paper_width || 80, height_mm: cached.paper_height ?? null, unit: 'mm' },
    elements,
    metadata: { name: cached.name, version: String(cached.version || 1) },
  };

  if (options.format === 'zpl' || cached.type === 'label') {
    const result = generateZpl(template, {
      dpi: options.dpi || 203,
      label_width_mm: cached.paper_width || 50,
      label_height_mm: cached.paper_height || options.label_height_mm || 30,
      data_context: options.data_context,
    });
    return { success: true, content: result.zpl, format: 'zpl' };
  }

  const rendered = renderReceipt(template, {
    format: options.format,
    paper_width_mm: cached.paper_width || 80,
    data_context: options.data_context,
  });
  return { success: true, content: rendered.content, format: rendered.format };
}
