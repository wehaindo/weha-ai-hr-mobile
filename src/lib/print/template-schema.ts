// Template JSON schema validation (zod).

import { z } from 'zod';

// === Base Element Schema ===

const BaseElementSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
  visible: z.boolean().optional().default(true),
  condition: z.string().optional(),
});

// === Receipt Element Schemas ===

const TextElementSchema = BaseElementSchema.extend({
  type: z.literal('text'),
  content: z.string().optional(),
  variable: z.string().optional(),
  fontSize: z.number().min(6).max(72).default(14),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  fontFamily: z.string().optional(),
});

const ImageElementSchema = BaseElementSchema.extend({
  type: z.literal('image'),
  src: z.string().optional(),
  variable: z.string().optional(),
  fitMode: z.enum(['contain', 'cover', 'fill']).optional().default('contain'),
});

const BarcodeElementSchema = BaseElementSchema.extend({
  type: z.literal('barcode'),
  barcodeType: z.enum(['code128', 'ean13', 'ean8', 'upca', 'upce', 'code39', 'itf']).default('code128'),
  variable: z.string().optional(),
  showText: z.boolean().optional().default(true),
});

const QRCodeElementSchema = BaseElementSchema.extend({
  type: z.literal('qrcode'),
  variable: z.string().optional(),
  errorCorrection: z.enum(['L', 'M', 'Q', 'H']).optional().default('M'),
});

const DividerElementSchema = BaseElementSchema.extend({
  type: z.literal('divider'),
  style: z.enum(['solid', 'dashed', 'dotted']).optional().default('solid'),
  thickness: z.number().min(1).max(10).optional().default(1),
});

const SpacerElementSchema = BaseElementSchema.extend({
  type: z.literal('spacer'),
});

const OrderLinesElementSchema = BaseElementSchema.extend({
  type: z.literal('order_lines'),
  columns: z.object({
    product_name: z.object({ show: z.boolean().default(true), width: z.number().default(50) }),
    quantity: z.object({ show: z.boolean().default(true), width: z.number().default(15) }),
    unit_price: z.object({ show: z.boolean().default(true), width: z.number().default(20) }),
    subtotal: z.object({ show: z.boolean().default(true), width: z.number().default(20) }),
  }),
  showDiscount: z.boolean().optional().default(false),
  showSku: z.boolean().optional().default(false),
});

const TotalsElementSchema = BaseElementSchema.extend({
  type: z.literal('totals'),
  fields: z.object({
    subtotal: z.boolean().default(true),
    discount: z.boolean().default(true),
    service_charge: z.boolean().default(false),
    tax: z.boolean().default(true),
    rounding: z.boolean().default(false),
    total: z.boolean().default(true),
    amount_paid: z.boolean().default(true),
    change: z.boolean().default(true),
  }),
});

const PaymentElementSchema = BaseElementSchema.extend({
  type: z.literal('payment'),
  showMethod: z.boolean().optional().default(true),
  showAmount: z.boolean().optional().default(true),
  showReference: z.boolean().optional().default(false),
  showChange: z.boolean().optional().default(true),
  splitLayout: z.enum(['list', 'summary']).optional().default('list'),
});

const CustomerElementSchema = BaseElementSchema.extend({
  type: z.literal('customer'),
  fields: z.object({
    name: z.boolean().default(true),
    phone: z.boolean().default(false),
    email: z.boolean().default(false),
    tax_id: z.boolean().default(false),
    loyalty_points: z.boolean().default(false),
  }),
});

const StoreElementSchema = BaseElementSchema.extend({
  type: z.literal('store'),
  fields: z.object({
    logo: z.boolean().default(true),
    name: z.boolean().default(true),
    address: z.boolean().default(true),
    phone: z.boolean().default(false),
    email: z.boolean().default(false),
    website: z.boolean().default(false),
    tax_id: z.boolean().default(false),
  }),
});

const FooterElementSchema = BaseElementSchema.extend({
  type: z.literal('footer'),
  content: z.string().optional(),
  showThankYou: z.boolean().optional().default(true),
  showBarcode: z.boolean().optional().default(false),
});

// === ZPL Element Schemas ===

const ZplTextElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_text'),
  content: z.string().optional(),
  variable: z.string().optional(),
  fontSize: z.number().min(6).max(72).default(14),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  rotation: z.number().min(0).max(270).optional().default(0),
  fontName: z.string().optional(),
});

const ZplBarcodeElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_barcode'),
  barcodeType: z.enum(['code128', 'ean13', 'ean8', 'upca', 'upce', 'code39', 'itf']).default('code128'),
  variable: z.string().optional(),
  showText: z.boolean().optional().default(true),
  rotation: z.number().min(0).max(270).optional().default(0),
  moduleWidth: z.number().min(1).max(10).optional().default(2),
  barHeight: z.number().min(10).max(300).optional().default(80),
});

const ZplQRCodeElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_qrcode'),
  variable: z.string().optional(),
  errorCorrection: z.enum(['L', 'M', 'Q', 'H']).optional().default('M'),
  rotation: z.number().min(0).max(270).optional().default(0),
  size: z.number().min(1).max(10).optional().default(3),
});

const ZplImageElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_image'),
  src: z.string().optional(),
  variable: z.string().optional(),
});

const ZplLineElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_line'),
  thickness: z.number().min(1).max(20).optional().default(2),
  color: z.string().optional().default('#000000'),
});

const ZplBoxElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_box'),
  borderWidth: z.number().min(1).max(20).optional().default(2),
  borderColor: z.string().optional().default('#000000'),
  filled: z.boolean().optional().default(false),
});

const ZplPriceElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_price'),
  variable: z.string().optional().default('product.price'),
  fontSize: z.number().min(8).max(72).optional().default(24),
  showCurrency: z.boolean().optional().default(true),
});

const ZplProductElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_product'),
  fields: z.object({
    name: z.boolean().default(true),
    sku: z.boolean().default(true),
    barcode: z.boolean().default(true),
    price: z.boolean().default(true),
    category: z.boolean().default(false),
    variant: z.boolean().default(false),
    uom: z.boolean().default(false),
  }),
});

const ZplBatchElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_batch'),
  fields: z.object({
    batch_number: z.boolean().default(true),
    lot_number: z.boolean().default(false),
    expiry_date: z.boolean().default(true),
    manufacturing_date: z.boolean().default(false),
  }),
});

const ZplSerialElementSchema = BaseElementSchema.extend({
  type: z.literal('zpl_serial'),
  serialNumber: z.string().optional(),
  showBarcode: z.boolean().optional().default(true),
});

// === Condition Schema ===

const ConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['exists', 'not_exists', 'equals', 'not_equals', 'greater_than', 'less_than']),
  value: z.string().optional(),
});

// === Element Unions ===

const ReceiptElementSchema = z.union([
  TextElementSchema,
  ImageElementSchema,
  BarcodeElementSchema,
  QRCodeElementSchema,
  DividerElementSchema,
  SpacerElementSchema,
  OrderLinesElementSchema,
  TotalsElementSchema,
  PaymentElementSchema,
  CustomerElementSchema,
  StoreElementSchema,
  FooterElementSchema,
]);

const ZplElementSchema = z.union([
  ZplTextElementSchema,
  ZplBarcodeElementSchema,
  ZplQRCodeElementSchema,
  ZplImageElementSchema,
  ZplLineElementSchema,
  ZplBoxElementSchema,
  ZplPriceElementSchema,
  ZplProductElementSchema,
  ZplBatchElementSchema,
  ZplSerialElementSchema,
]);

const AnyElementSchema = z.union([ReceiptElementSchema, ZplElementSchema]);

const PaperSchema = z.object({
  width_mm: z.number().min(20).max(300),
  height_mm: z.number().min(10).max(1000).nullable(),
  unit: z.literal('mm'),
});

const MetadataSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  author: z.string().max(100).optional(),
  version: z.string().max(20),
});

export const PrintTemplateSchema = z.object({
  schema_version: z.literal('1.0'),
  type: z.enum(['receipt', 'label', 'ticket', 'report']),
  paper: PaperSchema,
  elements: z.array(AnyElementSchema).max(50),
  conditions: z.array(ConditionSchema).optional(),
  metadata: MetadataSchema,
});

export type ValidatedPrintTemplate = z.infer<typeof PrintTemplateSchema>;

export function validateTemplate(
  data: unknown
): { success: true; data: ValidatedPrintTemplate } | { success: false; errors: string[] } {
  const result = PrintTemplateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errors: result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`),
  };
}

export function isValidTemplate(data: unknown): boolean {
  return PrintTemplateSchema.safeParse(data).success;
}

// === Default Templates ===

export function createDefaultReceiptTemplate() {
  return {
    schema_version: '1.0' as const,
    type: 'receipt' as const,
    paper: { width_mm: 80, height_mm: null, unit: 'mm' as const },
    elements: [
      { id: 'store_logo', type: 'image' as const, x: 0, y: 0, width: 80, height: 30, visible: true, variable: 'company.logo', fitMode: 'contain' as const },
      { id: 'store_name', type: 'text' as const, x: 0, y: 32, width: 80, height: 10, visible: true, variable: 'company.name', fontSize: 16, fontWeight: 'bold' as const, textAlign: 'center' as const },
      { id: 'store_addr', type: 'text' as const, x: 0, y: 44, width: 80, height: 8, visible: true, variable: 'company.address', fontSize: 10, fontWeight: 'normal' as const, textAlign: 'center' as const },
      { id: 'divider1', type: 'divider' as const, x: 0, y: 54, width: 80, height: 2, visible: true },
      { id: 'order_info', type: 'text' as const, x: 0, y: 58, width: 80, height: 8, visible: true, variable: 'order.number', fontSize: 10, fontWeight: 'normal' as const, textAlign: 'left' as const },
      { id: 'order_date', type: 'text' as const, x: 0, y: 68, width: 80, height: 8, visible: true, variable: 'order.date', fontSize: 10, fontWeight: 'normal' as const, textAlign: 'left' as const },
      { id: 'divider2', type: 'divider' as const, x: 0, y: 78, width: 80, height: 2, visible: true },
      { id: 'order_lines', type: 'order_lines' as const, x: 0, y: 82, width: 80, height: 40, visible: true, columns: { product_name: { show: true, width: 50 }, quantity: { show: true, width: 15 }, unit_price: { show: true, width: 20 }, subtotal: { show: true, width: 20 } }, showDiscount: false, showSku: false },
      { id: 'divider3', type: 'divider' as const, x: 0, y: 124, width: 80, height: 2, visible: true },
      { id: 'totals', type: 'totals' as const, x: 0, y: 128, width: 80, height: 30, visible: true, fields: { subtotal: true, discount: true, service_charge: false, tax: true, rounding: false, total: true, amount_paid: true, change: true } },
      { id: 'payment', type: 'payment' as const, x: 0, y: 160, width: 80, height: 20, visible: true, showMethod: true, showAmount: true, showReference: false, showChange: true, splitLayout: 'list' as const },
      { id: 'footer', type: 'footer' as const, x: 0, y: 182, width: 80, height: 15, visible: true, content: 'Thank you for your purchase!', showThankYou: true, showBarcode: false },
    ],
    metadata: { name: 'Default Receipt', description: 'Standard 80mm receipt template', version: '1.0' },
  };
}

export function createDefaultLabelTemplate() {
  return {
    schema_version: '1.0' as const,
    type: 'label' as const,
    paper: { width_mm: 50, height_mm: 30, unit: 'mm' as const },
    elements: [
      { id: 'product_name', type: 'text' as const, x: 2, y: 2, width: 46, height: 8, visible: true, variable: 'product.name', fontSize: 12, fontWeight: 'bold' as const, textAlign: 'left' as const },
      { id: 'product_sku', type: 'text' as const, x: 2, y: 12, width: 46, height: 6, visible: true, variable: 'product.sku', fontSize: 8, fontWeight: 'normal' as const, textAlign: 'left' as const },
      { id: 'barcode', type: 'barcode' as const, x: 2, y: 20, width: 46, height: 15, visible: true, barcodeType: 'ean13' as const, variable: 'product.barcode', showText: true },
      { id: 'price', type: 'text' as const, x: 2, y: 37, width: 46, height: 8, visible: true, variable: 'product.price', fontSize: 14, fontWeight: 'bold' as const, textAlign: 'left' as const },
    ],
    metadata: { name: 'Product Label', description: 'Standard 50x30mm product label', version: '1.0' },
  };
}

// === Paper Size Presets ===

export const PAPER_SIZE_PRESETS = {
  receipt: [
    { label: '58mm', width_mm: 58, height_mm: null },
    { label: '76mm', width_mm: 76, height_mm: null },
    { label: '80mm', width_mm: 80, height_mm: null },
    { label: '112mm', width_mm: 112, height_mm: null },
  ],
  label: [
    { label: '50×30mm', width_mm: 50, height_mm: 30 },
    { label: '70×40mm', width_mm: 70, height_mm: 40 },
    { label: '100×50mm', width_mm: 100, height_mm: 50 },
    { label: '100×100mm', width_mm: 100, height_mm: 100 },
  ],
} as const;

// === DPI Conversion ===

export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function dotsToMm(dots: number, dpi: number): number {
  return (dots / dpi) * 25.4;
}
