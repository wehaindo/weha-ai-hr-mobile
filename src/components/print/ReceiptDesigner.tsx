/* eslint-disable */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import {
  Save,
  Eye,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import DesignerCanvas from './designer-canvas';
import DesignerPalette from './designer-palette';
import DesignerProperties from './designer-properties';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { DesignerCanvasManager, type ElementData } from '@/lib/print/designer/canvas-manager';
import { PAPER_SIZE_PRESETS } from '@/lib/print/template-schema';
import { buildReceiptTemplateJson } from '@/lib/print/template-serializer';
import type { HardwareTemplate } from '@/types';

// Sample data for WYSIWYG preview
const SAMPLE_DATA: Record<string, any> = {
  'company.name': 'WEHA MART',
  'company.address': '123 Main Street, Jakarta',
  'company.footer': 'Thank you for your purchase!',
  'order.number': '#001234',
  'order.date': '2026-09-15',
  'cashier.name': 'Cashier 1',
  'customer.name': 'John Doe',
  'totals.subtotal': 68000,
  'totals.discount': 5000,
  'totals.tax': 6300,
  'totals.total': 69300,
  'payment.method': 'Cash',
  'payment.amount': 70000,
  'payment.change': 700,
};

/**
 * WYSIWYG preview rendered from clean element data using ABSOLUTE positioning —
 * identical layout to the design canvas so design == live == receipt preview.
 */
function WysiwygReceiptPreview({
  elements,
  paperWidth,
}: {
  elements: ElementData[];
  paperWidth: number;
}) {
  // Same px mapping as the canvas (1mm ≈ 3.78px)
  const canvasWidthPx = Math.round(paperWidth * 3.78);

  // Scale to fit in the panel (max ~330px wide)
  const scale = Math.min(330 / canvasWidthPx, 1);

  const visible = elements.filter((el) => el.visible !== false);

  const maxBottom = visible.reduce((max, el) => Math.max(max, el.y + el.height), 200);
  const containerWidth = canvasWidthPx * scale;
  const containerHeight = Math.max(200, maxBottom) * scale;

  function resolveText(el: ElementData): string {
    if (!el.variable) return el.content || '';
    const key = el.variable;
    if (key.startsWith('totals.')) {
      const map: Record<string, string> = {
        'totals.subtotal': 'Rp 68.000',
        'totals.discount': 'Rp 5.000',
        'totals.tax': 'Rp 6.300',
        'totals.total': 'Rp 69.300',
        'totals.rounding': '',
      };
      return map[key] || '';
    }
    return SAMPLE_DATA[key] || '';
  }

  return (
    <div className="bg-white rounded border shadow-sm p-3 mx-auto" style={{ width: 'fit-content' }}>
      <div
        className="relative bg-white"
        style={{
          width: containerWidth,
          height: containerHeight,
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: '1.4',
          color: '#000',
          backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) ' + (6 * scale - 1) + 'px, transparent ' + (6 * scale - 1) + 'px, transparent ' + 6 * scale + 'px)',
        }}
      >
        {visible.map((el, idx) => {
          const left = el.x * scale;
          const top = el.y * scale;

          // Text element — absolute position, matching canvas
          if (el.type === 'text') {
            return (
              <div
                key={el.id || idx}
                className="whitespace-pre absolute"
                style={{
                  left,
                  top,
                  fontWeight: el.fontWeight === 'bold' ? 'bold' : 'normal',
                  fontSize: Math.min(el.fontSize || 12, 14) * scale,
                  textAlign: (el.textAlign || 'left') as any,
                  lineHeight: 1.4,
                }}
              >
                {resolveText(el) || '\u00A0'}
              </div>
            );
          }

          // Divider / line — absolute position
          if (el.type === 'divider') {
            return (
              <div
                key={el.id || idx}
                className="absolute border-b border-dashed border-black"
                style={{ left, top, width: Math.max(20, el.width) * scale }}
              />
            );
          }

          // Order lines block
          if (el.type === 'order_lines') {
            return (
              <div
                key={el.id || idx}
                className="absolute space-y-0.5"
                style={{ left, top, width: Math.max(100, el.width) * scale, fontSize: 10 * scale }}
              >
                <div className="flex justify-between font-bold">
                  <span>Item</span><span>Total</span>
                </div>
                {['Cappuccino x2', 'Croissant x1'].map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{item}</span>
                    <span>{i === 0 ? '50,000' : '18,000'}</span>
                  </div>
                ))}
              </div>
            );
          }

          // Totals block
          if (el.type === 'totals') {
            return (
              <div
                key={el.id || idx}
                className="absolute space-y-0.5"
                style={{ left, top, width: Math.max(100, el.width) * scale, fontSize: 10 * scale }}
              >
                {[
                  ['Subtotal', 'Rp 68.000'],
                  ['Tax', 'Rp 6.300'],
                  ['TOTAL', 'Rp 69.300'],
                ].map(([label, val], i) => (
                  <div key={i} className={cn('flex justify-between', i === 2 && 'font-bold border-t border-dashed pt-1')}>
                    <span>{label}</span><span>{val}</span>
                  </div>
                ))}
              </div>
            );
          }

          // Payment block
          if (el.type === 'payment') {
            return (
              <div
                key={el.id || idx}
                className="absolute space-y-0.5"
                style={{ left, top, width: Math.max(100, el.width) * scale, fontSize: 10 * scale }}
              >
                <div className="flex justify-between"><span>Payment</span><span>Cash</span></div>
                <div className="flex justify-between"><span>Change</span><span>Rp 700</span></div>
              </div>
            );
          }

          // Barcode
          if (el.type === 'barcode') {
            return (
              <div
                key={el.id || idx}
                className="absolute text-center text-[9px] tracking-tighter text-gray-500"
                style={{ left, top, width: Math.max(100, el.width) * scale }}
              >
                |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

interface ReceiptDesignerProps {
  template?: HardwareTemplate | null;
  onSave?: (data: any) => void;
  onAutoSave?: (data: any) => void;
  onClose?: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export default function ReceiptDesigner({
  template,
  onSave,
  onAutoSave,
  onClose,
}: ReceiptDesignerProps) {
  const [name, setName] = useState(template?.name || 'New Receipt Template');
  const [paperWidth, setPaperWidth] = useState(template?.paper_width || 80);
  const [paperHeight, setPaperHeight] = useState<number | null>(template?.paper_height || null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [livePreview, setLivePreview] = useState(false);
  const [elementCount, setElementCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [dirty, setDirty] = useState(false);
  const [elementsVersion, setElementsVersion] = useState(0);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const managerRef = useRef<DesignerCanvasManager | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedContentRef = useRef<string>('');

  // Load existing template content
  const handleCanvasReady = useCallback((manager: DesignerCanvasManager) => {
    managerRef.current = manager;

    if (template?.content || template?.template_json) {
      try {
        const raw = template.template_json || template.content;
        const content = JSON.parse(raw || '{}');
        if (content.objects && Array.isArray(content.objects)) {
          manager.fromJSON(raw);
          setElementCount(manager.getElementCount());
          return;
        }
        const elements = content.elements || (Array.isArray(content) ? content : null);
        if (elements && Array.isArray(elements)) {
          // Template coordinates are in mm → scale to canvas px (3.78px/mm)
          const scale = 3.78;
          const canvasWidth = Math.round(paperWidth * scale);
          for (const el of elements) {
            if (el.visible === false) continue;
            const xPx = (el.x || 0) * scale;
            const yPx = (el.y || 0) * scale;
            const wPx = (el.width ?? paperWidth) * scale;
            const id = el.id || `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            if (el.type === 'text') {
              const obj = manager.addText({
                left: xPx,
                top: yPx,
                text: el.content || 'Text',
                fontSize: el.fontSize || 14,
                fontWeight: el.fontWeight || 'normal',
                textAlign: el.textAlign || 'left',
                width: wPx,
                id,
                snap: false,
              });
              if (el.variable) {
                manager.updateElement(id, { variable: el.variable });
                manager.alignText(id);
              }
              manager.attachRawElement(id, el);
            } else if (el.type === 'divider' || el.type === 'line') {
              manager.addLine({ left: xPx, top: yPx, width: wPx || canvasWidth - 20, id, snap: false });
              manager.attachRawElement(id, el);
            } else if (el.type === 'barcode') {
              manager.addBarcode({ left: xPx, top: yPx, width: wPx || 200, height: (el.height || 60) * scale, id, snap: false });
              if (el.barcodeType) manager.updateElement(id, { barcodeType: el.barcodeType });
              manager.attachRawElement(id, el);
            } else if (el.type === 'qrcode') {
              manager.addQRCode({ left: xPx, top: yPx, size: (el.width || 80) * scale, id, snap: false });
              manager.attachRawElement(id, el);
            } else {
              // Semantic blocks (order_lines, totals, payment, customer, store, footer) —
              // rendered as a placeholder rect and preserved verbatim via rawElement.
              const placeholder = el.type === 'order_lines' || el.type === 'totals' || el.type === 'payment';
              if (placeholder) {
                manager.addText({
                  left: xPx,
                  top: yPx,
                  text: `[${el.type}]`,
                  fontSize: 9,
                  fontWeight: 'normal',
                  textAlign: 'left',
                  width: wPx,
                  id,
                  snap: false,
                });
              } else {
                manager.addText({
                  left: xPx,
                  top: yPx,
                  text: el.content || `[${el.type}]`,
                  fontSize: el.fontSize || 12,
                  fontWeight: el.fontWeight || 'normal',
                  textAlign: el.textAlign || 'left',
                  width: wPx,
                  id,
                  snap: false,
                });
              }
              manager.attachRawElement(id, el);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load template:', e);
      }
    }

    setElementCount(manager.getElementCount());
  }, [template, paperWidth]);

  // Track element count / mark dirty on changes
  const markDirty = useCallback(() => {
    setDirty(true);
    const count = managerRef.current?.getElementCount() || 0;
    setElementCount(count);
    setElementsVersion(v => v + 1);
  }, []);

  const handleElementsChange = useCallback(() => {
    setElementCount(managerRef.current?.getElementCount() || 0);
    setElementsVersion(v => v + 1);
  }, []);

  const handleElementSelect = useCallback((element: any) => setSelectedElement(element), []);
  const handleElementUpdate = useCallback((element: any) => {
    setSelectedElement((prev: any) => (prev && prev.id === element.id ? element : prev));
    markDirty();
  }, [markDirty]);
  const handleElementMove = useCallback(() => {
    // No-op: Fabric.js handles position internally during drag.
    // Position sync happens in canvas-manager object:modified handler.
  }, []);

  const handlePropertyUpdate = useCallback((id: string, properties: Record<string, any>) => {
    managerRef.current?.updateElement(id, properties);
    markDirty();
  }, [markDirty]);

  const handleAddElement = useCallback((type: string) => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const canvasWidth = Math.round(paperWidth * 3.78);

    switch (type) {
      case 'text': mgr.addText({ text: 'Text', fontSize: 14 }); break;
      case 'divider': mgr.addLine({ width: canvasWidth - 20 }); break;
      case 'barcode': mgr.addBarcode({ width: 200, height: 60 }); break;
      case 'qrcode': mgr.addQRCode({ size: 80 }); break;
      case 'store': mgr.addText({ text: 'Store Name', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }); break;
      case 'order_info': mgr.addText({ text: 'Order #001', fontSize: 10 }); break;
      case 'totals': mgr.addText({ text: 'TOTAL: Rp 0', fontSize: 14, fontWeight: 'bold', textAlign: 'right' }); break;
      case 'payment': mgr.addText({ text: 'Payment: Cash', fontSize: 10 }); break;
      case 'footer': mgr.addText({ text: 'Thank you!', fontSize: 10, textAlign: 'center' }); break;
    }
    markDirty();
  }, [paperWidth, markDirty]);

  const buildSavePayload = useCallback(() => {
    const elements = managerRef.current?.getAllElementsData() || [];
    const content = buildReceiptTemplateJson({
      name: name.trim(),
      paperWidth,
      paperHeight,
      elements,
    });
    return {
      name: name.trim(),
      type: 'receipt' as const,
      device_type: 'receipt_printer',
      content,
      paper_width: paperWidth,
      paper_height: paperHeight,
      template_json: content,
      schema_version: '1.0',
      status: 'active',
    };
  }, [name, paperWidth, paperHeight]);

  // Autosave (debounced)
  useEffect(() => {
    if (!dirty || !onSave) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload = buildSavePayload();
      const json = payload.content;
      if (json === savedContentRef.current) {
        setDirty(false);
        return;
      }
      setSaveStatus('saving');
      (onAutoSave || onSave)?.(payload);
      savedContentRef.current = json;
      setSaveStatus('saved');
      setDirty(false);
      toast.add({ title: 'Template saved', type: 'success' });
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, onSave, buildSavePayload]);

  const performSave = () => {
    const payload = buildSavePayload();
    setSaveStatus('saving');
    onSave?.(payload);
    savedContentRef.current = payload.content;
    setSaveStatus('saved');
    setDirty(false);
    toast.add({ title: 'Template saved', type: 'success' });
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.add({ title: 'Template name is required', type: 'error' });
      return;
    }
    setConfirmSave(true);
  };

  const handleClose = () => {
    setConfirmClose(true);
  };

  const handleExport = () => {
    const elements = managerRef.current?.getAllElementsData() || [];
    const exportData = JSON.parse(
      buildReceiptTemplateJson({
        name: name.trim(),
        paperWidth,
        paperHeight,
        elements,
      })
    );
    exportData.metadata = {
      name: exportData.metadata?.name || name.trim(),
      description: 'Exported receipt template',
      version: '1.0',
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.add({ title: 'Template exported', type: 'success' });
  };

  const previewElements = managerRef.current?.getAllElementsData() || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-muted-foreground" />
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            className="h-8 w-64 font-medium"
            placeholder="Template name"
          />
          <Select
            value={String(paperWidth)}
            onValueChange={(v) => setPaperWidth(Number(v))}
          >
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPER_SIZE_PRESETS.receipt.map((preset) => (
                <SelectItem key={preset.width_mm} value={String(preset.width_mm)}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden lg:inline">
            {saveStatus === 'saving' && <span className="inline-flex items-center gap-1 text-amber-500"><Loader2 className="size-3 animate-spin" /> Saving…</span>}
            {saveStatus === 'saved' && <span className="text-green-600">Saved ✓</span>}
            {saveStatus === 'idle' && dirty && <span className="text-muted-foreground">Editing…</span>}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLivePreview(v => !v)}
            className={cn(livePreview && 'border-primary text-primary')}
          >
            <Eye className="size-4 mr-1" />
            Live Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-4 mr-1" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="size-4 mr-1" />
            Preview
          </Button>
          <Button size="sm" onClick={handleSave}>
            {saveStatus === 'saving' ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
            Save
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel - Palette */}
        <div className="w-48 border-r p-3 overflow-y-auto shrink-0">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Components
          </h4>
          <DesignerPalette onAddElement={handleAddElement} />
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 overflow-hidden min-w-0">
          <DesignerCanvas
            widthMm={paperWidth}
            heightMm={paperHeight}
            onElementSelect={handleElementSelect}
            onElementUpdate={handleElementUpdate}
            onElementMove={handleElementMove}
            onElementsChange={handleElementsChange}
            onCanvasReady={handleCanvasReady}
          />
        </div>

        {/* Right Panel - Properties or Live Preview */}
        <div className="w-64 border-l p-3 overflow-y-auto shrink-0">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            {livePreview ? 'Print Preview' : 'Properties'}
          </h4>
          {livePreview ? (
            <div className="flex justify-center pt-2">
              <WysiwygReceiptPreview elements={previewElements} paperWidth={paperWidth} />
            </div>
          ) : (
            <DesignerProperties
              element={selectedElement}
              onUpdate={handlePropertyUpdate}
              onDelete={(id) => {
                managerRef.current?.removeSelected();
                setSelectedElement(null);
                markDirty();
              }}
            />
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-1.5 border-t text-xs text-muted-foreground flex items-center gap-4 shrink-0 bg-muted/30">
        <span>{paperWidth}mm paper</span>
        <span>{elementCount} elements</span>
        <span>{livePreview ? 'Showing live print preview' : 'Editing canvas'}</span>
        <div className="flex-1" />
        <span className="hidden sm:inline">Double-click text to edit · Drag from palette · Ctrl+Z undo</span>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <WysiwygReceiptPreview elements={previewElements} paperWidth={paperWidth} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save confirmation */}
      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title="Save Template"
        description="Save changes to this template?"
        confirmLabel="Save"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmSave(false);
          performSave();
        }}
      />

      {/* Close / cancel confirmation */}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close Template"
        description={
          dirty
            ? 'You have unsaved changes. Close the editor and discard them?'
            : 'Close the template editor?'
        }
        confirmLabel={dirty ? 'Discard & Close' : 'Close'}
        cancelLabel="Keep Editing"
        variant={dirty ? 'destructive' : 'default'}
        onConfirm={() => {
          setConfirmClose(false);
          onClose?.();
        }}
      />
    </div>
  );
}
