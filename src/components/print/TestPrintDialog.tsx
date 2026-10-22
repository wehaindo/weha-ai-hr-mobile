'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Loader2, Printer } from 'lucide-react';
import { useBridge } from '@/platform';
import { PrinterAdapter } from '@/lib/print/printer-adapter';
import { parseTemplateContent } from '@/lib/print/template-resolver';
import { renderReceipt } from '@/lib/print/receipt-renderer';
import type { HardwareDevice, HardwareTemplate } from '@/types';
import type { PrintTemplate } from '@/types/print-template';
import type { PrintContentItem } from '@/lib/print/escpos-buffer';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TestPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPrinterId?: string;
}

const SAMPLE_DATA: Record<string, any> = {
  store: { name: 'WEHA POS', address: 'Jl. Contoh No. 1', phone: '021-0000000' },
  company: { name: 'WEHA POS' },
  order: { number: 'TEST-001', date: new Date().toLocaleString('id-ID') },
  cashier: { name: 'Test Cashier' },
  customer: { name: 'Walk-in Customer', phone: '' },
  items: [
    { product_name: 'Sample Item A', quantity: 2, unit_price: 15000, subtotal: 30000 },
    { product_name: 'Sample Item B', quantity: 1, unit_price: 5000, subtotal: 5000 },
  ],
  subtotal_cents: 35000,
  discount_total_cents: 0,
  tax_total_cents: 3500,
  total_cents: 38500,
  amount_received_cents: 40000,
  change_cents: 1500,
  payments: [{ method: 'cash', amount_cents: 40000 }],
  payment_method: 'cash',
};

function sampleContent(paperWidth: number): PrintContentItem[] {
  const width = paperWidth >= 80 ? 42 : paperWidth >= 76 ? 36 : 28;
  return [
    { type: 'text', value: '*** TEST PRINT ***', style: { align: 'center', bold: true, width: 2 } },
    { type: 'text', value: 'Device Test', style: { align: 'center', bold: true } },
    { type: 'text', value: new Date().toLocaleString(), style: { align: 'center' } },
    { type: 'line', width },
    { type: 'text', value: 'If you can read this, the printer is working.' },
    { type: 'feed', lines: 3 },
    { type: 'cut' },
  ];
}

export default function TestPrintDialog({ open, onOpenChange, defaultPrinterId }: TestPrintDialogProps) {
  const bridge = useBridge();
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [templates, setTemplates] = useState<HardwareTemplate[]>([]);
  const [printerId, setPrinterId] = useState<string>(defaultPrinterId || '');
  const [templateId, setTemplateId] = useState<string>('__sample__');
  const [printing, setPrinting] = useState(false);

  async function load() {
    try {
      const [d, t] = await Promise.all([
        bridge.db.query<HardwareDevice>("SELECT * FROM hardware_devices WHERE is_active = 1 AND type IN ('receipt_printer','label_printer','kitchen_printer') ORDER BY is_default DESC, name ASC"),
        bridge.db.query<HardwareTemplate>('SELECT * FROM hardware_templates WHERE is_active = 1 ORDER BY name ASC'),
      ]);
      setDevices(d);
      setTemplates(t);
      if (!printerId && d.length > 0) setPrinterId(d[0].id);
    } catch (error) {
      console.error('[TestPrint] Failed to load devices/templates:', error);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (defaultPrinterId) setPrinterId(defaultPrinterId);
  }, [defaultPrinterId]);

  const selectedPrinter = useMemo(() => devices.find((d) => d.id === printerId) || null, [devices, printerId]);

  async function handlePrint() {
    if (!selectedPrinter) {
      toast.add({ title: 'Select a printer first', type: 'error' });
      return;
    }
    setPrinting(true);
    try {
      const connection = PrinterAdapter.resolveConnection(selectedPrinter.connection_type, selectedPrinter.connection_config);

      let content: PrintContentItem[];
      let paperWidth = 80;
      try {
        paperWidth = JSON.parse(selectedPrinter.connection_config || '{}').paper_width || 80;
      } catch {
        paperWidth = 80;
      }

      if (templateId !== '__sample__') {
        const template = templates.find((t) => t.id === templateId);
        if (!template) {
          toast.add({ title: 'Template not found', type: 'error' });
          return;
        }
        const parsed = parseTemplateContent(template);
        const printTemplate: PrintTemplate = {
          schema_version: '1.0',
          type: 'receipt',
          paper: { width_mm: parsed.paperWidth, height_mm: parsed.paperHeight, unit: 'mm' },
          elements: parsed.elements,
          metadata: { name: template.name, version: '1' },
        };
        const rendered = renderReceipt(printTemplate, {
          format: 'escpos',
          paper_width_mm: parsed.paperWidth,
          data_context: SAMPLE_DATA,
        });
        content = rendered.content as PrintContentItem[];
        paperWidth = parsed.paperWidth;
      } else {
        content = sampleContent(paperWidth);
      }

      const result = await PrinterAdapter.print(bridge, content, connection, { printer_id: selectedPrinter.id });

      if (result.success) {
        toast.add({ title: 'Test print sent', type: 'success' });
        onOpenChange(false);
      } else {
        toast.add({ title: result.error || 'Test print failed', type: 'error' });
      }
    } catch (error: any) {
      toast.add({ title: error?.message || 'Test print failed', type: 'error' });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Print</DialogTitle>
          <DialogDescription>Send a sample print to verify printer connectivity and formatting.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Printer</label>
            <Select value={printerId} onValueChange={(v) => setPrinterId(v ?? '')}>
              <SelectTrigger data-testid="test-print-printer-select">
                <SelectValue placeholder="Select a printer" />
              </SelectTrigger>
              <SelectContent>
                {devices.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No printers configured
                  </SelectItem>
                ) : (
                  devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} {d.is_default === 1 ? '(default)' : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Content</label>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? '__sample__')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sample__">Sample test receipt</SelectItem>
                {templates
                  .filter((t) => t.type === 'receipt')
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={printing || !selectedPrinter} data-testid="send-test-print">
            {printing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Printer className="size-4 mr-2" />}
            Print Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
