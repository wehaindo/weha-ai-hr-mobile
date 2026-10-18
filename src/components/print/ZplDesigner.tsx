/* eslint-disable */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Tag,
  Type,
  Barcode,
  QrCode,
  Square,
  Minus,
} from 'lucide-react';
import { PAPER_SIZE_PRESETS, mmToDots } from '@/lib/print/template-schema';
import type { HardwareTemplate } from '@/types';

interface ZplDesignerProps {
  template?: HardwareTemplate | null;
  onSave?: (data: any) => void;
  onClose?: () => void;
}

interface LabelElement {
  id: string;
  type: 'text' | 'barcode' | 'qrcode' | 'line' | 'box';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  variable?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  barcodeType?: string;
}

const LABEL_COMPONENTS = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'barcode', label: 'Barcode', icon: Barcode },
  { type: 'qrcode', label: 'QR Code', icon: QrCode },
  { type: 'line', label: 'Line', icon: Minus },
  { type: 'box', label: 'Box', icon: Square },
];

const LABEL_VARIABLES = [
  { key: 'product.name', label: 'Product Name' },
  { key: 'product.sku', label: 'SKU' },
  { key: 'product.barcode', label: 'Barcode' },
  { key: 'product.price', label: 'Price' },
  { key: 'product.category', label: 'Category' },
  { key: 'batch.number', label: 'Batch Number' },
  { key: 'batch.expiry_date', label: 'Expiry Date' },
  { key: 'serial.number', label: 'Serial Number' },
];

export default function ZplDesigner({
  template,
  onSave,
  onClose,
}: ZplDesignerProps) {
  const [name, setName] = useState(template?.name || 'New Label Template');
  const [widthMm, setWidthMm] = useState(50);
  const [heightMm, setHeightMm] = useState(30);
  const [dpi, setDpi] = useState(203);
  const [elements, setElements] = useState<LabelElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Load template elements on mount
  useEffect(() => {
    if (template?.content) {
      try {
        const content = JSON.parse(template.content);
        const els = content.elements || (Array.isArray(content) ? content : null);
        if (els && Array.isArray(els)) {
          setElements(els);
        }
      } catch {
        // ignore
      }
    }
  }, [template]);

  const widthDots = mmToDots(widthMm, dpi);
  const heightDots = mmToDots(heightMm, dpi);
  const scaleX = Math.min(300 / widthDots, 300 / heightDots, 2);

  function addElement(type: LabelElement['type']) {
    const newElement: LabelElement = {
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      x: 10,
      y: elements.length * 20 + 10,
      width: type === 'line' ? widthDots - 20 : 100,
      height: type === 'line' ? 2 : 30,
      content: type === 'text' ? 'Text' : undefined,
      fontSize: 12,
      barcodeType: 'code128',
    };
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  }

  function updateElement(id: string, data: Partial<LabelElement>) {
    setElements(elements.map(el => el.id === id ? { ...el, ...data } : el));
  }

  function deleteElement(id: string) {
    setElements(elements.filter(el => el.id !== id));
    setSelectedId(null);
  }

  function generateZpl(): string {
    let zpl = '^XA\n';
    zpl += `^PW${widthDots}\n`;
    zpl += `^LL${heightDots}\n`;

    for (const el of elements) {
      switch (el.type) {
        case 'text':
          zpl += `^FO${el.x},${el.y}\n`;
          zpl += `^A0N,${el.fontSize || 12},${el.fontSize || 12}\n`;
          zpl += `^FD${el.content || 'Text'}^FS\n`;
          break;
        case 'barcode':
          zpl += `^FO${el.x},${el.y}\n`;
          zpl += `^BY2\n`;
          zpl += `^BCN,${el.height},Y,N\n`;
          zpl += `^FD${el.content || '123456789'}^FS\n`;
          break;
        case 'qrcode':
          zpl += `^FO${el.x},${el.y}\n`;
          zpl += `^BQN,2,5\n`;
          zpl += `^FDQA,${el.content || 'QRDATA'}^FS\n`;
          break;
        case 'line':
          zpl += `^FO${el.x},${el.y}\n`;
          zpl += `^GB${el.width},${el.height},${el.height}^FS\n`;
          break;
        case 'box':
          zpl += `^FO${el.x},${el.y}\n`;
          zpl += `^GB${el.width},${el.height},2^FS\n`;
          break;
      }
    }

    zpl += '^XZ';
    return zpl;
  }

  function handleSave() {
    if (!name.trim()) {
      toast.add({ title: 'Template name is required', type: 'error' });
      return;
    }

    const zpl = generateZpl();
    onSave?.({
      name: name.trim(),
      type: 'label',
      device_type: 'label_printer',
      content: JSON.stringify(elements),
      paper_width: widthMm,
      paper_height: heightMm,
      schema_version: '1.0',
      status: 'active',
      template_json: JSON.stringify({
        schema_version: '1.0',
        type: 'label',
        paper: { width_mm: widthMm, height_mm: heightMm, unit: 'mm' },
        dpi,
        zpl,
        elements,
        metadata: { name: name.trim(), version: '1.0' },
      }),
    });
  }

  function handleExport() {
    const zpl = generateZpl();
    const blob = new Blob([zpl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_').toLowerCase()}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
    toast.add({ title: 'ZPL exported', type: 'success' });
  }

  const selectedElement = elements.find(el => el.id === selectedId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Tag className="size-5 text-muted-foreground" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-48 font-medium"
            placeholder="Template name"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Label className="text-xs">W:</Label>
              <Input
                type="number"
                value={widthMm}
                onChange={(e) => setWidthMm(Number(e.target.value))}
                className="h-8 w-16 text-xs"
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs">H:</Label>
              <Input
                type="number"
                value={heightMm}
                onChange={(e) => setHeightMm(Number(e.target.value))}
                className="h-8 w-16 text-xs"
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>
            <Select value={String(dpi)} onValueChange={(v) => setDpi(Number(v))}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="203">203 DPI</SelectItem>
                <SelectItem value="300">300 DPI</SelectItem>
                <SelectItem value="600">600 DPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-4 mr-1" />
            Export ZPL
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="size-4 mr-1" />
            Preview
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="size-4 mr-1" />
            Save
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Components */}
        <div className="w-40 border-r p-3 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Components
          </h4>
          <div className="space-y-1.5">
            {LABEL_COMPONENTS.map((comp) => {
              const Icon = comp.icon;
              return (
                <button
                  key={comp.type}
                  onClick={() => addElement(comp.type as LabelElement['type'])}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-background border border-input hover:bg-accent text-sm transition-colors"
                >
                  <Icon className="size-3.5" />
                  {comp.label}
                </button>
              );
            })}
          </div>

          {/* Variables */}
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">
            Variables
          </h4>
          <div className="text-xs text-muted-foreground space-y-1">
            {LABEL_VARIABLES.map((v) => (
              <div key={v.key} className="flex justify-between">
                <span>{v.label}</span>
                <code className="text-xs bg-muted px-1 rounded">{`{{${v.key}}}`}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Center - Label Canvas */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-start justify-center">
          <div
            className="relative bg-white border shadow-sm"
            style={{
              width: widthDots * scaleX,
              height: heightDots * scaleX,
            }}
          >
            {elements.map((el) => (
              <div
                key={el.id}
                className={cn(
                  'absolute cursor-pointer border-2',
                  selectedId === el.id ? 'border-blue-500' : 'border-transparent hover:border-blue-300'
                )}
                style={{
                  left: el.x * scaleX,
                  top: el.y * scaleX,
                  width: el.width * scaleX,
                  height: el.height * scaleX,
                }}
                onClick={() => setSelectedId(el.id)}
              >
                {el.type === 'text' && (
                  <div
                    className="w-full h-full flex items-center p-0.5 overflow-hidden"
                    style={{
                      fontSize: (el.fontSize || 12) * scaleX * 0.8,
                      fontWeight: el.fontWeight || 'normal',
                    }}
                  >
                    {el.variable ? `{{${el.variable}}}` : el.content || 'Text'}
                  </div>
                )}
                {el.type === 'barcode' && (
                  <div className="w-full h-full flex items-center justify-center bg-gray-50 text-xs">
                    |||||||||
                  </div>
                )}
                {el.type === 'qrcode' && (
                  <div className="w-full h-full flex items-center justify-center bg-gray-50 text-xs">
                    QR
                  </div>
                )}
                {el.type === 'line' && (
                  <div className="w-full h-0.5 bg-black" style={{ marginTop: el.height * scaleX / 2 }} />
                )}
                {el.type === 'box' && (
                  <div className="w-full h-full border border-black" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Properties */}
        <div className="w-56 border-l p-3 overflow-y-auto">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Properties
          </h4>
          {selectedElement ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{selectedElement.type}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7"
                  onClick={() => deleteElement(selectedElement.id)}
                >
                  Delete
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">X</Label>
                  <Input
                    type="number"
                    value={selectedElement.x}
                    onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Y</Label>
                  <Input
                    type="number"
                    value={selectedElement.y}
                    onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              {selectedElement.type === 'text' && (
                <>
                  <div>
                    <Label className="text-xs">Content</Label>
                    <Input
                      value={selectedElement.content || ''}
                      onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Variable</Label>
                    <Select
                      value={selectedElement.variable || ''}
                      onValueChange={(v) => updateElement(selectedElement.id, { variable: v || undefined })}
                    >
                      <SelectTrigger className="h-7">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {LABEL_VARIABLES.map((v) => (
                          <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Font Size</Label>
                    <Input
                      type="number"
                      value={selectedElement.fontSize || 12}
                      onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                      className="h-7 text-xs"
                    />
                  </div>
                </>
              )}

              {selectedElement.type === 'barcode' && (
                <div>
                  <Label className="text-xs">Barcode Type</Label>
                  <Select
                    value={selectedElement.barcodeType || 'code128'}
                    onValueChange={(v) => updateElement(selectedElement.id, { barcodeType: v || 'code128' })}
                  >
                    <SelectTrigger className="h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="code128">Code 128</SelectItem>
                      <SelectItem value="ean13">EAN-13</SelectItem>
                      <SelectItem value="ean8">EAN-8</SelectItem>
                      <SelectItem value="upca">UPC-A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8 text-sm">
              Select an element to edit
            </div>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ZPL Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded border font-mono text-xs overflow-auto max-h-64">
              <pre>{generateZpl()}</pre>
            </div>
            <div className="text-sm text-muted-foreground">
              Label: {widthMm}mm × {heightMm}mm at {dpi} DPI = {widthDots} × {heightDots} dots
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
