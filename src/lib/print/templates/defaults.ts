/* eslint-disable */
// Phase 26: Default (seed) print templates.
//
// Canonical copies of the templates seeded by `seedHardwareTemplates()` in
// `electron/main.js`. Used by the "Reset to Default" action to restore a
// template's original layout after user edits / corruption.

export interface DefaultTemplate {
  name: string;
  type: 'receipt' | 'label';
  device_type: string;
  paper_width: number;
  template_json: string;
}

function buildReceipt(
  name: string,
  description: string,
  elements: Record<string, any>[]
): DefaultTemplate {
  return {
    name,
    type: 'receipt',
    device_type: 'receipt_printer',
    paper_width: 80,
    template_json: JSON.stringify({
      schema_version: '1.0',
      type: 'receipt',
      paper: { width_mm: 80, height_mm: null, unit: 'mm' },
      elements,
      metadata: { name, description, version: '1.0' },
    }),
  };
}

function buildLabel(
  name: string,
  description: string,
  paperWidth: number,
  paperHeight: number,
  elements: Record<string, any>[]
): DefaultTemplate {
  return {
    name,
    type: 'label',
    device_type: 'label_printer',
    paper_width: paperWidth,
    template_json: JSON.stringify({
      schema_version: '1.0',
      type: 'label',
      paper: { width_mm: paperWidth, height_mm: paperHeight, unit: 'mm' },
      elements,
      metadata: { name, description, version: '1.0' },
    }),
  };
}

// === Receipt templates ===

const STANDARD_RECEIPT = buildReceipt(
  'Standard Receipt',
  'Standard 80mm receipt with dynamic data',
  [
    { id: 'store_name', type: 'text', x: 0, y: 1.5, width: 80, height: 5, visible: true, variable: 'company.name', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
    { id: 'store_addr', type: 'text', x: 0, y: 7.5, width: 80, height: 4, visible: true, variable: 'company.address', fontSize: 9, fontWeight: 'normal', textAlign: 'center' },
    { id: 'divider1', type: 'divider', x: 3, y: 12, width: 74, height: 1, visible: true },
    { id: 'order_no', type: 'text', x: 3, y: 15, width: 74, height: 4, visible: true, variable: 'order.number', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
    { id: 'order_date', type: 'text', x: 3, y: 20, width: 74, height: 4, visible: true, variable: 'order.date', fontSize: 9, fontWeight: 'normal', textAlign: 'left' },
    { id: 'cashier', type: 'text', x: 3, y: 24.5, width: 74, height: 4, visible: true, variable: 'cashier.name', fontSize: 9, fontWeight: 'normal', textAlign: 'left' },
    { id: 'divider2', type: 'divider', x: 3, y: 29, width: 74, height: 1, visible: true },
    { id: 'order_lines', type: 'order_lines', x: 3, y: 31.5, width: 74, height: 16, visible: true },
    { id: 'divider3', type: 'divider', x: 3, y: 48.5, width: 74, height: 1, visible: true },
    { id: 'totals', type: 'totals', x: 3, y: 51, width: 74, height: 14, visible: true, fields: { subtotal: true, discount: true, tax: true, rounding: true, total: true } },
    { id: 'divider4', type: 'divider', x: 3, y: 66.5, width: 74, height: 1, visible: true },
    { id: 'payment', type: 'payment', x: 3, y: 69, width: 74, height: 11, visible: true },
    { id: 'divider5', type: 'divider', x: 3, y: 81, width: 74, height: 1, visible: true },
    { id: 'footer', type: 'text', x: 0, y: 84, width: 80, height: 4, visible: true, variable: 'company.footer', fontSize: 9, fontWeight: 'normal', textAlign: 'center' },
  ]
);

const CAFE_RECEIPT = buildReceipt(
  'Cafe Receipt',
  'Compact cafe receipt with dynamic data',
  [
    { id: 'store_name', type: 'text', x: 0, y: 1.5, width: 80, height: 5, visible: true, variable: 'company.name', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
    { id: 'divider1', type: 'divider', x: 3, y: 8, width: 74, height: 1, visible: true },
    { id: 'order_no', type: 'text', x: 3, y: 11, width: 74, height: 4, visible: true, variable: 'order.number', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
    { id: 'order_date', type: 'text', x: 3, y: 16, width: 74, height: 4, visible: true, variable: 'order.date', fontSize: 9, fontWeight: 'normal', textAlign: 'left' },
    { id: 'divider2', type: 'divider', x: 3, y: 20.5, width: 74, height: 1, visible: true },
    { id: 'order_lines', type: 'order_lines', x: 3, y: 23, width: 74, height: 13, visible: true },
    { id: 'divider3', type: 'divider', x: 3, y: 37, width: 74, height: 1.5, visible: true },
    { id: 'totals', type: 'totals', x: 3, y: 39.5, width: 74, height: 11, visible: true, fields: { subtotal: false, discount: false, tax: false, rounding: false, total: true } },
    { id: 'payment', type: 'payment', x: 3, y: 51.5, width: 74, height: 8, visible: true },
    { id: 'footer', type: 'text', x: 0, y: 62, width: 80, height: 4, visible: true, variable: 'company.footer', fontSize: 9, fontWeight: 'normal', textAlign: 'center' },
  ]
);

const RESTAURANT_RECEIPT = buildReceipt(
  'Restaurant Receipt',
  'Restaurant receipt with table info and dynamic data',
  [
    { id: 'store_name', type: 'text', x: 0, y: 1.5, width: 80, height: 5, visible: true, variable: 'company.name', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
    { id: 'store_addr', type: 'text', x: 0, y: 7.5, width: 80, height: 4, visible: true, variable: 'company.address', fontSize: 9, fontWeight: 'normal', textAlign: 'center' },
    { id: 'divider1', type: 'divider', x: 3, y: 12, width: 74, height: 1, visible: true },
    { id: 'order_no', type: 'text', x: 3, y: 14.5, width: 40, height: 4, visible: true, variable: 'order.number', fontSize: 10, fontWeight: 'bold', textAlign: 'left' },
    { id: 'table_info', type: 'text', x: 43, y: 14.5, width: 34, height: 4, visible: true, variable: 'order.table', fontSize: 10, fontWeight: 'normal', textAlign: 'right' },
    { id: 'order_type', type: 'text', x: 3, y: 19, width: 74, height: 4, visible: true, variable: 'order.type', fontSize: 9, fontWeight: 'normal', textAlign: 'left' },
    { id: 'divider2', type: 'divider', x: 3, y: 23.5, width: 74, height: 1, visible: true },
    { id: 'order_lines', type: 'order_lines', x: 3, y: 26, width: 74, height: 16, visible: true },
    { id: 'divider3', type: 'divider', x: 3, y: 43, width: 74, height: 1, visible: true },
    { id: 'totals', type: 'totals', x: 3, y: 45.5, width: 74, height: 14, visible: true, fields: { subtotal: true, discount: true, tax: true, rounding: true, total: true } },
    { id: 'divider4', type: 'divider', x: 3, y: 61, width: 74, height: 1, visible: true },
    { id: 'payment', type: 'payment', x: 3, y: 63.5, width: 74, height: 11, visible: true },
    { id: 'divider5', type: 'divider', x: 3, y: 75.5, width: 74, height: 1, visible: true },
    { id: 'footer', type: 'text', x: 0, y: 78.5, width: 80, height: 4, visible: true, variable: 'company.footer', fontSize: 9, fontWeight: 'normal', textAlign: 'center' },
  ]
);

// === Label templates ===

const PRODUCT_LABEL = buildLabel('Product Label', 'Standard 50x30mm product label with barcode', 50, 30, [
  { id: 'product_name', type: 'text', x: 5, y: 5, width: 180, height: 20, visible: true, variable: 'product.name', fontSize: 12, fontWeight: 'bold', textAlign: 'left' },
  { id: 'product_sku', type: 'text', x: 5, y: 28, width: 180, height: 12, visible: true, variable: 'product.sku', fontSize: 8, fontWeight: 'normal', textAlign: 'left' },
  { id: 'barcode', type: 'barcode', x: 5, y: 45, width: 180, height: 40, visible: true, barcodeType: 'ean13', variable: 'product.barcode' },
  { id: 'price', type: 'text', x: 5, y: 95, width: 180, height: 14, visible: true, variable: 'product.price', fontSize: 14, fontWeight: 'bold', textAlign: 'left' },
]);

const PRICE_TAG = buildLabel('Price Tag', '70x40mm price tag with barcode', 70, 40, [
  { id: 'product_name', type: 'text', x: 5, y: 5, width: 260, height: 20, visible: true, variable: 'product.name', fontSize: 14, fontWeight: 'bold', textAlign: 'left' },
  { id: 'product_category', type: 'text', x: 5, y: 28, width: 260, height: 12, visible: true, variable: 'product.category', fontSize: 9, fontWeight: 'normal', textAlign: 'left' },
  { id: 'divider', type: 'line', x: 5, y: 45, width: 260, height: 1, visible: true },
  { id: 'price_label', type: 'text', x: 5, y: 55, width: 80, height: 12, visible: true, content: 'Price', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
  { id: 'price_value', type: 'text', x: 90, y: 52, width: 175, height: 18, visible: true, variable: 'product.price', fontSize: 18, fontWeight: 'bold', textAlign: 'right' },
  { id: 'barcode', type: 'barcode', x: 5, y: 80, width: 260, height: 40, visible: true, barcodeType: 'code128', variable: 'product.barcode' },
]);

const SHELF_LABEL = buildLabel('Shelf Label', '100x50mm shelf label with large barcode', 100, 50, [
  { id: 'store_name', type: 'text', x: 5, y: 5, width: 370, height: 16, visible: true, content: 'WEHA MART', fontSize: 14, fontWeight: 'bold', textAlign: 'left' },
  { id: 'divider1', type: 'line', x: 5, y: 25, width: 370, height: 1, visible: true },
  { id: 'product_name', type: 'text', x: 5, y: 35, width: 370, height: 20, visible: true, variable: 'product.name', fontSize: 16, fontWeight: 'bold', textAlign: 'left' },
  { id: 'product_sku', type: 'text', x: 5, y: 58, width: 180, height: 12, visible: true, variable: 'product.sku', fontSize: 9, fontWeight: 'normal', textAlign: 'left' },
  { id: 'barcode', type: 'barcode', x: 5, y: 75, width: 370, height: 50, visible: true, barcodeType: 'ean13', variable: 'product.barcode' },
  { id: 'price', type: 'text', x: 5, y: 135, width: 370, height: 24, visible: true, variable: 'product.price', fontSize: 24, fontWeight: 'bold', textAlign: 'left' },
]);

const BATCH_LABEL = buildLabel('Batch Label', '100x100mm batch/lot label with QR code', 100, 100, [
  { id: 'product_name', type: 'text', x: 5, y: 5, width: 370, height: 18, visible: true, variable: 'product.name', fontSize: 14, fontWeight: 'bold', textAlign: 'left' },
  { id: 'product_sku', type: 'text', x: 5, y: 28, width: 180, height: 12, visible: true, variable: 'product.sku', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
  { id: 'divider1', type: 'line', x: 5, y: 45, width: 370, height: 1, visible: true },
  { id: 'batch_label', type: 'text', x: 5, y: 55, width: 100, height: 12, visible: true, content: 'Batch:', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
  { id: 'batch_value', type: 'text', x: 110, y: 55, width: 265, height: 12, visible: true, variable: 'batch.number', fontSize: 10, fontWeight: 'bold', textAlign: 'left' },
  { id: 'expiry_label', type: 'text', x: 5, y: 72, width: 100, height: 12, visible: true, content: 'Exp:', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
  { id: 'expiry_value', type: 'text', x: 110, y: 72, width: 265, height: 12, visible: true, variable: 'batch.expiry_date', fontSize: 10, fontWeight: 'bold', textAlign: 'left' },
  { id: 'divider2', type: 'line', x: 5, y: 90, width: 370, height: 1, visible: true },
  { id: 'barcode', type: 'barcode', x: 5, y: 100, width: 370, height: 60, visible: true, barcodeType: 'code128', variable: 'product.barcode' },
  { id: 'qr_code', type: 'qrcode', x: 5, y: 170, width: 80, height: 80, visible: true, variable: 'product.barcode' },
  { id: 'warehouse', type: 'text', x: 95, y: 175, width: 280, height: 12, visible: true, variable: 'warehouse.name', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
  { id: 'location', type: 'text', x: 95, y: 192, width: 280, height: 12, visible: true, variable: 'warehouse.location', fontSize: 10, fontWeight: 'normal', textAlign: 'left' },
]);

export const DEFAULT_PRINT_TEMPLATES: DefaultTemplate[] = [
  STANDARD_RECEIPT,
  CAFE_RECEIPT,
  RESTAURANT_RECEIPT,
  PRODUCT_LABEL,
  PRICE_TAG,
  SHELF_LABEL,
  BATCH_LABEL,
];

/** Find the canonical default template definition by name. */
export function getDefaultTemplate(name: string): DefaultTemplate | undefined {
  return DEFAULT_PRINT_TEMPLATES.find((t) => t.name === name);
}
