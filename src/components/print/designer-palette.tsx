/* eslint-disable */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Type,
  Minus,
  Barcode,
  QrCode,
  Image,
  FileText,
  Calculator,
  CreditCard,
  User,
  Store,
  LayoutList,
  AlignCenter,
  Search,
} from 'lucide-react';

interface PaletteItem {
  type: string;
  label: string;
  icon: any;
  category: 'basic' | 'transaction' | 'barcode';
  description: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  // Basic
  { type: 'text', label: 'Text', icon: Type, category: 'basic', description: 'Static or {{dynamic}} text' },
  { type: 'divider', label: 'Divider', icon: Minus, category: 'basic', description: 'Horizontal separator line' },
  { type: 'image', label: 'Image', icon: Image, category: 'basic', description: 'Logo or product image' },
  // Transaction
  { type: 'store', label: 'Store Info', icon: Store, category: 'transaction', description: 'Company name, address, phone' },
  { type: 'order_info', label: 'Order Info', icon: FileText, category: 'transaction', description: 'Order number, date, cashier' },
  { type: 'order_lines', label: 'Product Lines', icon: LayoutList, category: 'transaction', description: 'Items, qty, price, subtotal' },
  { type: 'totals', label: 'Totals', icon: Calculator, category: 'transaction', description: 'Subtotal, tax, discount, total' },
  { type: 'payment', label: 'Payment', icon: CreditCard, category: 'transaction', description: 'Method, amount, change' },
  { type: 'customer', label: 'Customer', icon: User, category: 'transaction', description: 'Customer name & info' },
  { type: 'footer', label: 'Footer', icon: AlignCenter, category: 'transaction', description: 'Thank you / footer text' },
  // Barcode
  { type: 'barcode', label: 'Barcode', icon: Barcode, category: 'barcode', description: 'Code128, EAN, UPC barcode' },
  { type: 'qrcode', label: 'QR Code', icon: QrCode, category: 'barcode', description: 'QR code for payment/link' },
];

const CATEGORIES = [
  { key: 'basic', label: 'Basic' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'barcode', label: 'Barcode & QR' },
] as const;

interface DesignerPaletteProps {
  onAddElement?: (type: string) => void;
  className?: string;
}

export default function DesignerPalette({ onAddElement, className }: DesignerPaletteProps) {
  const [query, setQuery] = useState('');

  function handleDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData('application/json', JSON.stringify({ type }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleClick(type: string) {
    onAddElement?.(type);
  }

  const q = query.trim().toLowerCase();

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search components..."
          className="h-8 pl-7 text-sm"
        />
      </div>

      {CATEGORIES.map((cat) => {
        const items = PALETTE_ITEMS.filter(
          (item) => item.category === cat.key && (!q || item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q))
        );
        if (items.length === 0) return null;

        return (
          <div key={cat.key}>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              {cat.label}
            </h4>
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.type)}
                    onClick={() => handleClick(item.type)}
                    title={item.description}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background border border-input hover:bg-accent hover:text-accent-foreground cursor-grab active:cursor-grabbing text-sm transition-colors"
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {PALETTE_ITEMS.filter(
        (item) => q && (item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q))
      ).length === 0 && q && (
        <p className="text-xs text-muted-foreground text-center py-4">No components match "{query}"</p>
      )}
    </div>
  );
}
