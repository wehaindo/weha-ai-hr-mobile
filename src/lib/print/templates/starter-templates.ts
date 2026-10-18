/* eslint-disable */
// Phase 26 Sub-Phase 26.10: Business Starter Templates
//
// Ready-to-use receipt and label templates seeded on first run so a new tenant
// has something to print immediately. Users can clone and customise them.

export interface StarterTemplate {
  name: string;
  type: 'receipt' | 'label';
  device_type: string;
  paper_width: number;
  paper_height: number | null;
  status: 'draft' | 'active';
  is_default?: boolean;
  business_type?: string;
  template_json: string;
}

const now = () => new Date().toISOString();

interface TextOpts {
  variable?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  condition?: string;
}

function text(id: string, content: string, opts: TextOpts = {}): any {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 76,
    height: 10,
    content,
    fontSize: opts.fontSize ?? 12,
    fontWeight: opts.fontWeight ?? 'normal',
    textAlign: opts.textAlign ?? 'left',
    ...(opts.variable ? { variable: opts.variable } : {}),
    ...(opts.condition ? { condition: opts.condition } : {}),
  };
}

function divider(id: string): any {
  return { id, type: 'divider', x: 0, y: 0, width: 76, height: 6, style: 'solid', thickness: 1 };
}

function spacer(id: string, height = 8): any {
  return { id, type: 'spacer', x: 0, y: 0, width: 76, height };
}

function block(id: string, type: string, extra: Record<string, any> = {}): any {
  return { id, type, x: 0, y: 0, width: 76, height: 24, ...extra };
}

function receipt(
  name: string,
  businessType: string,
  elements: any[],
  opts: Partial<StarterTemplate> = {}
): StarterTemplate {
  // Auto-assign sequential y-coordinates based on array order
  let y = 0;
  const positionedElements = elements.map((el) => {
    const height = el.height || 10;
    const positioned = { ...el, y };
    y += height + 2;
    return positioned;
  });

  return {
    name,
    type: 'receipt',
    device_type: 'receipt_printer',
    paper_width: opts.paper_width ?? 80,
    paper_height: null,
    status: 'active',
    is_default: opts.is_default,
    business_type: businessType,
    template_json: JSON.stringify({
      schema_version: '1.0',
      type: 'receipt',
      paper: { width_mm: opts.paper_width ?? 80, height_mm: null, unit: 'mm' },
      elements: positionedElements,
      metadata: { name, version: '1.0', author: 'WEHA POS' },
    }),
  };
}

function label(
  name: string,
  width: number,
  height: number,
  elements: any[],
  opts: Partial<StarterTemplate> = {}
): StarterTemplate {
  return {
    name,
    type: 'label',
    device_type: 'label_printer',
    paper_width: width,
    paper_height: height,
    status: 'active',
    is_default: opts.is_default,
    template_json: JSON.stringify({
      schema_version: '1.0',
      type: 'label',
      paper: { width_mm: width, height_mm: height, unit: 'mm' },
      elements,
      metadata: { name, version: '1.0', author: 'WEHA POS' },
    }),
  };
}

const storeHeader = [
  block('store', 'store', {
    fields: { logo: true, name: true, address: true, phone: true, email: false, website: false, tax_id: false },
  }),
  spacer('sp1', 6),
];

const orderMeta = [
  text('ord-no', 'Order: '),
  text('ord-date', '', { variable: 'order.date' }),
  divider('dv1'),
];

export const STARTER_RECEIPT_TEMPLATES: StarterTemplate[] = [
  receipt(
    'Cafe Receipt',
    'cafe',
    [
      ...storeHeader,
      ...orderMeta,
      block('lines', 'order_lines', {
        columns: {
          product_name: { show: true, width: 40 },
          quantity: { show: true, width: 10 },
          unit_price: { show: false, width: 0 },
          subtotal: { show: true, width: 20 },
        },
      }),
      divider('dv2'),
      block('totals', 'totals', {
        fields: {
          subtotal: true,
          discount: true,
          service_charge: false,
          tax: true,
          rounding: false,
          total: true,
          amount_paid: true,
          change: true,
        },
      }),
      text('type-badge', 'TAKEAWAY', { textAlign: 'center', fontWeight: 'bold', condition: 'order.type == "takeaway"' }),
      block('payment', 'payment', { showMethod: true, showAmount: true }),
      block('footer', 'footer', { content: 'Thank you. See you again!', showThankYou: true }),
    ],
    { is_default: true }
  ),
  receipt('Restaurant Receipt', 'restaurant', [
    ...storeHeader,
    text('table', '', { variable: 'order.table', condition: 'order.table' }),
    text('guests', 'Guests: ', { variable: 'order.guests', condition: 'order.guests' }),
    ...orderMeta,
    block('lines', 'order_lines', {
      columns: {
        product_name: { show: true, width: 40 },
        quantity: { show: true, width: 10 },
        unit_price: { show: true, width: 12 },
        subtotal: { show: true, width: 18 },
      },
    }),
    divider('dv2'),
    block('totals', 'totals', {
      fields: {
        subtotal: true,
        discount: true,
        service_charge: true,
        tax: true,
        rounding: true,
        total: true,
        amount_paid: true,
        change: true,
      },
    }),
    block('payment', 'payment', { showMethod: true, showAmount: true, splitLayout: 'list' }),
    block('footer', 'footer', { content: 'Terima kasih atas kunjungan Anda', showThankYou: true }),
  ]),
  receipt('Retail Receipt', 'retail', [
    ...storeHeader,
    ...orderMeta,
    text('cashier', '', { variable: 'cashier.name' }),
    block('lines', 'order_lines', {
      columns: {
        product_name: { show: true, width: 38 },
        quantity: { show: true, width: 8 },
        unit_price: { show: true, width: 14 },
        subtotal: { show: true, width: 20 },
      },
      showSku: true,
      showDiscount: true,
    }),
    divider('dv2'),
    block('totals', 'totals', {
      fields: {
        subtotal: true,
        discount: true,
        service_charge: false,
        tax: true,
        rounding: true,
        total: true,
        amount_paid: true,
        change: true,
      },
    }),
    text('loyalty', 'Points earned: ', { variable: 'loyalty.points_earned', condition: 'customer.loyalty_points' }),
    block('payment', 'payment', { showMethod: true, showAmount: true }),
    block('footer', 'footer', { content: 'Barang yang sudah dibeli tidak dapat ditukar', showThankYou: false }),
  ]),
  receipt('Salon Receipt', 'salon', [
    ...storeHeader,
    text('staff', 'Staff: ', { variable: 'order.staff_name' }),
    text('session', 'Duration: ', { variable: 'order.duration_minutes', condition: 'order.duration_minutes' }),
    ...orderMeta,
    block('lines', 'order_lines', {
      columns: {
        product_name: { show: true, width: 40 },
        quantity: { show: true, width: 10 },
        unit_price: { show: true, width: 12 },
        subtotal: { show: true, width: 18 },
      },
    }),
    divider('dv2'),
    block('totals', 'totals', {
      fields: {
        subtotal: true,
        discount: true,
        service_charge: true,
        tax: true,
        rounding: false,
        total: true,
        amount_paid: true,
        change: true,
      },
    }),
    block('customer', 'customer', {
      fields: { name: true, phone: true, email: false, tax_id: false, loyalty_points: true },
    }),
    block('footer', 'footer', { content: 'Sampai jumpa lagi!', showThankYou: true }),
  ]),
  receipt('Service Receipt', 'service', [
    ...storeHeader,
    text('work-order', 'Work Order: ', { variable: 'order.work_order_no' }),
    text('warranty', 'Warranty until: ', { variable: 'order.warranty_until', condition: 'order.warranty_until' }),
    ...orderMeta,
    block('lines', 'order_lines', {
      columns: {
        product_name: { show: true, width: 40 },
        quantity: { show: true, width: 10 },
        unit_price: { show: true, width: 12 },
        subtotal: { show: true, width: 18 },
      },
    }),
    divider('dv2'),
    block('totals', 'totals', {
      fields: {
        subtotal: true,
        discount: true,
        service_charge: false,
        tax: true,
        rounding: false,
        total: true,
        amount_paid: true,
        change: true,
      },
    }),
    block('customer', 'customer', {
      fields: { name: true, phone: true, email: false, tax_id: false, loyalty_points: false },
    }),
    block('footer', 'footer', { content: 'Garansi tidak berlaku untuk kerusakan akibat kelalaian', showThankYou: false }),
  ]),
  receipt('Tax Invoice', 'retail', [
    ...storeHeader,
    text('tax-id', 'NPWP: ', { variable: 'store.tax_id' }),
    text('invoice', 'Invoice: ', { variable: 'order.number' }),
    text('invoice-date', '', { variable: 'order.date' }),
    divider('dv1'),
    block('customer', 'customer', {
      fields: { name: true, phone: false, email: false, tax_id: true, loyalty_points: false },
    }),
    block('lines', 'order_lines', {
      columns: {
        product_name: { show: true, width: 36 },
        quantity: { show: true, width: 10 },
        unit_price: { show: true, width: 14 },
        subtotal: { show: true, width: 20 },
      },
    }),
    divider('dv2'),
    block('totals', 'totals', {
      fields: {
        subtotal: true,
        discount: true,
        service_charge: false,
        tax: true,
        rounding: false,
        total: true,
        amount_paid: true,
        change: false,
      },
    }),
    block('footer', 'footer', { content: 'Faktur pajak sederhana. Simpan sebagai bukti pembelian.', showThankYou: false }),
  ]),
];

export const STARTER_LABEL_TEMPLATES: StarterTemplate[] = [
  label(
    'Product Label 50x30',
    50,
    30,
    [
      { id: 'name', type: 'text', x: 2, y: 2, width: 46, height: 8, content: '', variable: 'product.name', fontSize: 12, fontWeight: 'bold', textAlign: 'left' },
      { id: 'sku', type: 'text', x: 2, y: 10, width: 46, height: 6, content: '', variable: 'product.sku', fontSize: 9, fontWeight: 'normal', textAlign: 'left' },
      { id: 'barcode', type: 'barcode', x: 2, y: 16, width: 30, height: 10, barcodeType: 'code128', variable: 'product.barcode', showText: true, barHeight: 40, moduleWidth: 1 },
      { id: 'price', type: 'price', x: 32, y: 18, width: 16, height: 10, variable: 'product.price', fontSize: 20, showCurrency: true },
    ],
    { is_default: true }
  ),
  label('Price Tag 70x40', 70, 40, [
    { id: 'name', type: 'text', x: 3, y: 3, width: 64, height: 8, content: '', variable: 'product.name', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
    { id: 'price', type: 'price', x: 3, y: 13, width: 64, height: 16, variable: 'product.price', fontSize: 32, showCurrency: true },
    { id: 'orig', type: 'text', x: 3, y: 30, width: 64, height: 6, content: '', variable: 'product.original_price', fontSize: 11, fontWeight: 'normal', textAlign: 'center', condition: 'product.original_price' },
  ]),
  label('Shelf Label 100x50', 100, 50, [
    { id: 'cat', type: 'text', x: 3, y: 3, width: 94, height: 7, content: '', variable: 'product.category', fontSize: 12, fontWeight: 'normal', textAlign: 'left' },
    { id: 'name', type: 'text', x: 3, y: 12, width: 94, height: 10, content: '', variable: 'product.name', fontSize: 16, fontWeight: 'bold', textAlign: 'left' },
    { id: 'sku', type: 'text', x: 3, y: 24, width: 94, height: 6, content: '', variable: 'product.sku', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
    { id: 'price', type: 'price', x: 3, y: 32, width: 94, height: 14, variable: 'product.price', fontSize: 28, showCurrency: true },
  ]),
  label('Batch Label 100x100', 100, 100, [
    { id: 'name', type: 'text', x: 3, y: 3, width: 94, height: 8, content: '', variable: 'product.name', fontSize: 14, fontWeight: 'bold', textAlign: 'left' },
    { id: 'batch', type: 'text', x: 3, y: 14, width: 94, height: 6, content: '', variable: 'batch.number', fontSize: 11, fontWeight: 'normal', textAlign: 'left' },
    { id: 'lot', type: 'text', x: 3, y: 22, width: 94, height: 6, content: '', variable: 'batch.lot_number', fontSize: 11, fontWeight: 'normal', textAlign: 'left' },
    { id: 'exp', type: 'text', x: 3, y: 30, width: 94, height: 6, content: '', variable: 'batch.expiry_date', fontSize: 12, fontWeight: 'bold', textAlign: 'left' },
    { id: 'wh', type: 'text', x: 3, y: 38, width: 94, height: 6, content: '', variable: 'warehouse.name', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
    { id: 'barcode', type: 'barcode', x: 3, y: 50, width: 80, height: 20, barcodeType: 'code128', variable: 'product.barcode', showText: true, barHeight: 80, moduleWidth: 2 },
  ]),
];

export const STARTER_PRINT_TEMPLATES: StarterTemplate[] = [
  ...STARTER_RECEIPT_TEMPLATES,
  ...STARTER_LABEL_TEMPLATES,
];

export function buildStarterTemplatePayload(t: StarterTemplate) {
  return {
    name: t.name,
    type: t.type,
    device_type: t.device_type,
    content: '',
    variables: '[]',
    paper_width: t.paper_width,
    paper_height: t.paper_height,
    is_default: t.is_default ? 1 : 0,
    schema_version: '1.0',
    template_json: t.template_json,
    status: t.status,
  };
}

export const STARTER_TEMPLATE_META = { seeded_at: now() };
