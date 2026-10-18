/* eslint-disable */
'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Trash2,
  Eye,
  EyeOff,
  Type,
  Barcode,
  Move,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCw,
} from 'lucide-react';
import { RECEIPT_DYNAMIC_FIELDS, type DynamicField } from '@/types/print-template';
import DesignerConditionEditor from './designer-condition-editor';

const FIELD_CATEGORIES = [
  { key: 'company', label: 'Company / Store' },
  { key: 'order', label: 'Order' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'customer', label: 'Customer' },
  { key: 'line', label: 'Line Items' },
  { key: 'totals', label: 'Totals' },
  { key: 'payment', label: 'Payment' },
  { key: 'coupon', label: 'Coupon' },
  { key: 'loyalty', label: 'Loyalty' },
];

interface DesignerPropertiesProps {
  element: {
    id: string;
    type: string;
    object: any;
  } | null;
  onUpdate?: (id: string, properties: Record<string, any>) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const FONT_FAMILIES = [
  { value: 'monospace', label: 'Monospace' },
  { value: 'Courier', label: 'Courier' },
  { value: 'Arial', label: 'Arial' },
  { value: 'sans-serif', label: 'Sans Serif' },
];
const BARCODE_TYPES = [
  { value: 'code128', label: 'Code 128' },
  { value: 'ean13', label: 'EAN-13' },
  { value: 'ean8', label: 'EAN-8' },
  { value: 'upca', label: 'UPC-A' },
  { value: 'upce', label: 'UPC-E' },
  { value: 'code39', label: 'Code 39' },
  { value: 'itf', label: 'ITF' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
        {title}
      </h4>
      {children}
    </div>
  );
}

export default function DesignerProperties({
  element,
  onUpdate,
  onDelete,
  className,
}: DesignerPropertiesProps) {
  const [content, setContent] = useState('');
  const [variable, setVariable] = useState<string>('');
  const [fontSize, setFontSize] = useState(14);
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontFamily, setFontFamily] = useState('monospace');
  const [textAlign, setTextAlign] = useState('left');
  const [visible, setVisible] = useState(true);
  const [condition, setCondition] = useState('');
  const [barcodeType, setBarcodeType] = useState('code128');
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(30);
  const [rotation, setRotation] = useState(0);

  // Sync state when element changes
  const syncFromObject = useCallback((obj: any, type: string) => {
    if (!obj) return;
    setVariable(obj.variable || '');
    if (type === 'text') {
      setContent(obj.templateContent || obj.text || '');
      setFontSize(obj.fontSize || 14);
      setFontWeight(obj.fontWeight || 'normal');
      setFontFamily(obj.fontFamily || 'monospace');
      setTextAlign(obj.textAlign || 'left');
    }
    if (type === 'barcode') {
      setBarcodeType(obj.barcodeType || 'code128');
    }
    setVisible(obj.visible !== false);
    setCondition(obj.condition || obj.rawElement?.condition || '');
    const rect = obj.getBoundingRect ? obj.getBoundingRect() : { left: obj.left, top: obj.top, width: obj.width, height: obj.height };
    setPosX(Math.round(rect.left));
    setPosY(Math.round(rect.top));
    setWidth(Math.round(rect.width));
    setHeight(Math.round(rect.height));
    setRotation(Math.round(obj.angle || 0) % 360);
  }, []);

  useEffect(() => {
    if (!element?.object) return;
    syncFromObject(element.object, element.type);
  }, [element?.id]);

  const handleUpdate = useCallback((key: string, value: any) => {
    if (!element) return;
    onUpdate?.(element.id, { [key]: value });
  }, [element, onUpdate]);

  if (!element) {
    return (
      <div className={cn('text-center text-muted-foreground py-8', className)}>
        <Type className="size-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select an element to edit</p>
        <p className="text-xs mt-1">or double-click text to edit inline</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Element Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-muted rounded">
            {element.type === 'text' && <Type className="size-3.5" />}
            {element.type === 'barcode' && <Barcode className="size-3.5" />}
            {!['text', 'barcode'].includes(element.type) && <Move className="size-3.5" />}
          </div>
          <span className="text-sm font-medium capitalize">{element.type}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete?.(element.id)}
          className="text-destructive hover:text-destructive h-7"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Visibility */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Visible</Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => {
            const newVisible = !visible;
            setVisible(newVisible);
            handleUpdate('visible', newVisible);
          }}
        >
          {visible ? <Eye className="size-4 text-green-600" /> : <EyeOff className="size-4 text-muted-foreground" />}
        </Button>
      </div>

      {/* Field Selector — top of panel for quick access */}
      {(element.type === 'text' || element.type === 'barcode' || element.type === 'qrcode') && (
        <Section title="Field">
          <div className="space-y-2">
            <Label className="text-xs">Dynamic Field</Label>
            <Select
              value={variable}
              onValueChange={(v) => {
                setVariable(v ?? '');
                handleUpdate('variable', v || undefined);
                // Auto-fill text content with field placeholder for text elements
                if (element.type === 'text' && v) {
                  const field = RECEIPT_DYNAMIC_FIELDS.find((f) => f.key === v);
                  if (field) {
                    const placeholder = `{{${field.label}}}`;
                    setContent(placeholder);
                    handleUpdate('content', placeholder);
                  }
                }
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select a field..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None (Static text)</SelectItem>
                {FIELD_CATEGORIES.map((cat) => {
                  const fields = RECEIPT_DYNAMIC_FIELDS.filter((f) => f.category === cat.key);
                  if (fields.length === 0) return null;
                  return (
                    <SelectItem key={`cat-${cat.key}`} value={`__cat_${cat.key}`} disabled className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">
                      {cat.label}
                    </SelectItem>
                  );
                }).filter(Boolean)}
                {FIELD_CATEGORIES.map((cat) => {
                  const fields = RECEIPT_DYNAMIC_FIELDS.filter((f) => f.category === cat.key);
                  if (fields.length === 0) return null;
                  return fields.map((field) => (
                    <SelectItem key={field.key} value={field.key} className="pl-6">
                      {field.label}
                    </SelectItem>
                  ));
                }).filter(Boolean)}
              </SelectContent>
            </Select>
            {variable && (
              <p className="text-[10px] text-muted-foreground">
                Variable: <code className="bg-muted px-1 rounded">{variable}</code>
              </p>
            )}
          </div>
        </Section>
      )}

      {/* Conditional Visibility */}
      <Section title="Conditional Visibility">
        <DesignerConditionEditor
          value={condition}
          onChange={(v) => {
            setCondition(v);
            handleUpdate('condition', v || undefined);
          }}
        />
      </Section>

      {/* Content */}
      {element.type === 'text' && (
        <Section title="Content">
          <div className="space-y-2">
            <Label className="text-xs">Text</Label>
            <Input
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                handleUpdate('content', e.target.value);
              }}
              placeholder="Enter text or select a field above"
              className="h-8 text-sm"
            />
          </div>
        </Section>
      )}

      {/* Appearance */}
      {element.type === 'text' && (
        <Section title="Appearance">
          <div className="space-y-2">
            <Label className="text-xs">Font Family</Label>
            <Select
              value={fontFamily}
              onValueChange={(v) => {
                setFontFamily(v ?? 'monospace');
                handleUpdate('fontFamily', v);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Font Size</Label>
              <Select
                value={String(fontSize)}
                onValueChange={(v) => {
                  const size = Number(v ?? '14');
                  setFontSize(size);
                  handleUpdate('fontSize', size);
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}px</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Weight</Label>
              <Select
                value={fontWeight}
                onValueChange={(v) => {
                  setFontWeight(v ?? 'normal');
                  handleUpdate('fontWeight', v);
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alignment</Label>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((al) => {
                const Icon = al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight;
                const active = textAlign === al;
                return (
                  <Button
                    key={al}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 h-7"
                    onClick={() => {
                      setTextAlign(al);
                      handleUpdate('textAlign', al);
                    }}
                  >
                    <Icon className="size-3.5" />
                  </Button>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      {/* Barcode Properties */}
      {element.type === 'barcode' && (
        <Section title="Barcode">
          <div className="space-y-2">
            <Label className="text-xs">Barcode Type</Label>
            <Select
              value={barcodeType}
              onValueChange={(v) => {
                setBarcodeType(v ?? 'code128');
                handleUpdate('barcodeType', v);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BARCODE_TYPES.map((bt) => (
                  <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>
      )}

      {/* Position & Size */}
      <Section title="Position & Size">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">X</Label>
            <Input
              value={posX}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPosX(val);
                handleUpdate('left', val);
              }}
              className="h-8 text-sm"
              type="number"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Y</Label>
            <Input
              value={posY}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPosY(val);
                handleUpdate('top', val);
              }}
              className="h-8 text-sm"
              type="number"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">W</Label>
            <Input
              value={width}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setWidth(val);
                handleUpdate('width', val);
              }}
              className="h-8 text-sm"
              type="number"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">H</Label>
            <Input
              value={height}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setHeight(val);
                handleUpdate('height', val);
              }}
              className="h-8 text-sm"
              type="number"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <RotateCw className="size-3" /> Rotation
          </Label>
          <div className="flex gap-1">
            {[0, 90, 180, 270].map((r) => (
              <Button
                key={r}
                variant={rotation === r ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-7"
                onClick={() => {
                  setRotation(r);
                  handleUpdate('angle', r);
                }}
              >
                {r}°
              </Button>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
