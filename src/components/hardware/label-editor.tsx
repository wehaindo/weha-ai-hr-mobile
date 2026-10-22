/* eslint-disable */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { toast } from '@/components/ui/toast';
import {
  Plus,
  Trash2,
  Save,
  Eye,
  Type,
  Image,
  Square,
  Barcode,
  GripVertical,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { HardwareTemplate, HardwareTemplateType } from '@/types';

interface TemplateElement {
  id: string;
  type: 'text' | 'barcode' | 'qrcode' | 'image' | 'line' | 'box';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  variable?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  borderWidth?: number;
  borderColor?: string;
}

interface LabelEditorProps {
  template?: HardwareTemplate | null;
  onSave: (data: any) => void;
  onClose: () => void;
}

const ELEMENT_TYPES = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'barcode', label: 'Barcode', icon: Barcode },
  { type: 'qrcode', label: 'QR Code', icon: Square },
  { type: 'line', label: 'Line', icon: Square },
  { type: 'box', label: 'Box', icon: Square },
];

const AVAILABLE_VARIABLES = [
  { key: 'product_name', label: 'Product Name' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'sku', label: 'SKU' },
  { key: 'price', label: 'Price' },
  { key: 'original_price', label: 'Original Price' },
  { key: 'unit', label: 'Unit' },
  { key: 'category', label: 'Category' },
  { key: 'store_name', label: 'Store Name' },
  { key: 'store_address', label: 'Store Address' },
  { key: 'receipt_no', label: 'Receipt No' },
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'tax', label: 'Tax' },
  { key: 'total', label: 'Total' },
  { key: 'payment_method', label: 'Payment Method' },
  { key: 'order_no', label: 'Order No' },
  { key: 'table', label: 'Table' },
  { key: 'items', label: 'Items' },
  { key: 'notes', label: 'Notes' },
  { key: 'priority', label: 'Priority' },
];

const PAPER_SIZES = [
  { label: '58mm Receipt', width: 384, height: 200 },
  { label: '80mm Receipt', width: 512, height: 300 },
  { label: '50mm Label', width: 320, height: 200 },
  { label: '40mm Tag', width: 256, height: 160 },
  { label: '100mm Label', width: 640, height: 400 },
  { label: 'Custom', width: 400, height: 300 },
];

function TemplateCanvas({
  elements,
  selectedId,
  onSelect,
  onUpdate,
  paperWidth,
  paperHeight,
}: {
  elements: TemplateElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, data: Partial<TemplateElement>) => void;
  paperWidth: number;
  paperHeight: number;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, element: TemplateElement) => {
    e.stopPropagation();
    onSelect(element.id);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - element.x,
      y: e.clientY - element.y,
    });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !selectedId) return;
      const element = elements.find((el) => el.id === selectedId);
      if (!element) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, paperWidth - element.width));
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, paperHeight - element.height));

      onUpdate(selectedId, { x: newX, y: newY });
    },
    [isDragging, selectedId, dragOffset, elements, onUpdate, paperWidth, paperHeight]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div
      ref={canvasRef}
      className="relative bg-white border border-gray-300 shadow-sm"
      style={{ width: paperWidth, height: paperHeight }}
      onClick={() => onSelect(null)}
      onMouseMove={handleMouseMove}
    >
      {elements.map((element) => (
        <div
          key={element.id}
          className={cn(
            'absolute cursor-move border-2',
            selectedId === element.id ? 'border-blue-500' : 'border-transparent hover:border-blue-300'
          )}
          style={{
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
          }}
          onMouseDown={(e) => handleMouseDown(e, element)}
        >
          {element.type === 'text' && (
            <div
              className="w-full h-full flex items-center p-1"
              style={{
                fontSize: element.fontSize || 14,
                fontWeight: element.fontWeight || 'normal',
                textAlign: element.textAlign || 'left',
              }}
            >
              {element.variable ? `{{${element.variable}}}` : element.content || 'Text'}
            </div>
          )}
          {element.type === 'barcode' && (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-xs">
              ||||||||||||
            </div>
          )}
          {element.type === 'qrcode' && (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-xs">
              QR
            </div>
          )}
          {element.type === 'line' && (
            <div
              className="w-full h-0.5 bg-black"
              style={{ marginTop: element.height / 2 }}
            />
          )}
          {element.type === 'box' && (
            <div
              className="w-full h-full border"
              style={{
                borderWidth: element.borderWidth || 1,
                borderColor: element.borderColor || '#000',
              }}
            />
          )}
          {selectedId === element.id && (
            <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-1 rounded">
              {element.type}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function LabelEditor({ template, onSave, onClose }: LabelEditorProps) {
  const [name, setName] = useState(template?.name || '');
  const [type, setType] = useState<HardwareTemplateType>(template?.type || 'label');
  const [deviceType, setDeviceType] = useState(template?.device_type || 'label_printer');
  const [paperWidth, setPaperWidth] = useState(template?.paper_width || 320);
  const [paperHeight, setPaperHeight] = useState(template?.paper_height || 200);
  const [elements, setElements] = useState<TemplateElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    if (template?.content) {
      try {
        const parsed = JSON.parse(template.content);
        if (Array.isArray(parsed)) {
          setElements(parsed);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [template]);

  function addElement(type: TemplateElement['type']) {
    const newElement: TemplateElement = {
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      x: 10,
      y: elements.length * 30 + 10,
      width: type === 'line' ? paperWidth - 20 : 100,
      height: type === 'line' ? 4 : 30,
      content: type === 'text' ? 'Sample Text' : undefined,
      fontSize: 14,
      fontWeight: 'normal',
      textAlign: 'left',
    };
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  }

  function updateElement(id: string, data: Partial<TemplateElement>) {
    setElements(elements.map((el) => (el.id === id ? { ...el, ...data } : el)));
  }

  function deleteElement(id: string) {
    setElements(elements.filter((el) => el.id !== id));
    setSelectedId(null);
  }

  function handleSave() {
    if (!name.trim()) {
      toast.add({ title: 'Template name is required', type: 'error' });
      return;
    }

    onSave({
      name: name.trim(),
      type,
      device_type: deviceType,
      content: JSON.stringify(elements),
      variables: JSON.stringify(AVAILABLE_VARIABLES.map((v) => v.key)),
      paper_width: paperWidth,
      paper_height: paperHeight,
    });
  }

  const selectedElement = elements.find((el) => el.id === selectedId);

  return (
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>{template ? 'Edit Template' : 'Create Template'}</DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-hidden flex gap-4">
        {/* Left Panel - Properties */}
        <div className="w-64 flex flex-col gap-4 overflow-y-auto">
          {/* Template Settings */}
          <div className="flex flex-col gap-3">
            <h4 className="font-medium text-sm">Template Settings</h4>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Type</label>
              <Select
                value={type}
                onValueChange={(v) => v && setType(v as HardwareTemplateType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="label">Label</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="ticket">Ticket</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Paper Size</label>
              <Select
                value={`${paperWidth}x${paperHeight}`}
                onValueChange={(v) => {
                  const [w, h] = (v ?? '').split('x').map(Number);
                  setPaperWidth(w);
                  setPaperHeight(h);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_SIZES.map((ps) => (
                    <SelectItem key={ps.label} value={`${ps.width}x${ps.height}`}>
                      {ps.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Add Elements */}
          <div className="flex flex-col gap-2">
            <h4 className="font-medium text-sm">Add Elements</h4>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_TYPES.map((et) => {
                const Icon = et.icon;
                return (
                  <Button
                    key={et.type}
                    variant="outline"
                    size="sm"
                    onClick={() => addElement(et.type as TemplateElement['type'])}
                  >
                    <Icon className="size-4 mr-1" />
                    {et.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Element Properties */}
          {selectedElement && (
            <div className="flex flex-col gap-3">
              <h4 className="font-medium text-sm">Element Properties</h4>
              {selectedElement.type === 'text' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Content</label>
                    <Input
                      value={selectedElement.content || ''}
                      onChange={(e) => updateElement(selectedId!, { content: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Variable</label>
                    <Select
                      value={selectedElement.variable || ''}
                      onValueChange={(v) => updateElement(selectedId!, { variable: v || undefined })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {AVAILABLE_VARIABLES.map((v) => (
                          <SelectItem key={v.key} value={v.key}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Font Size</label>
                    <Input
                      type="number"
                      value={selectedElement.fontSize || 14}
                      onChange={(e) =>
                        updateElement(selectedId!, { fontSize: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Font Weight</label>
                    <Select
                      value={selectedElement.fontWeight || 'normal'}
                      onValueChange={(v) =>
                        updateElement(selectedId!, { fontWeight: v as 'normal' | 'bold' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Width</label>
                  <Input
                    type="number"
                    value={selectedElement.width}
                    onChange={(e) =>
                      updateElement(selectedId!, { width: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Height</label>
                  <Input
                    type="number"
                    value={selectedElement.height}
                    onChange={(e) =>
                      updateElement(selectedId!, { height: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteElement(selectedId!)}
              >
                <Trash2 className="size-4 mr-1" />
                Delete Element
              </Button>
            </div>
          )}

          {/* Variables Reference */}
          <div className="flex flex-col gap-2">
            <h4 className="font-medium text-sm">Available Variables</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              {AVAILABLE_VARIABLES.map((v) => (
                <div key={v.key} className="flex justify-between">
                  <span>{v.label}</span>
                  <code className="text-xs bg-muted px-1 rounded">{`{{${v.key}}}`}</code>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-start justify-center">
          <TemplateCanvas
            elements={elements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={updateElement}
            paperWidth={paperWidth}
            paperHeight={paperHeight}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          <Save className="size-4 mr-1" />
          Save Template
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
