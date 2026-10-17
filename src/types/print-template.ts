// Phase 26: Receipt & ZPL Label Designer — Template Types

export type PrintTemplateType = 'receipt' | 'label' | 'ticket' | 'report';
export type PrintTemplateStatus = 'draft' | 'active' | 'archived';
export type PrintJobStatus = 'pending' | 'printing' | 'printed' | 'failed' | 'retry';
export type PrintJobType = 'receipt' | 'label' | 'ticket' | 'report';
export type ConditionOperator = 'exists' | 'not_exists' | 'equals' | 'not_equals' | 'greater_than' | 'less_than';
export type BarcodeType = 'code128' | 'ean13' | 'ean8' | 'upca' | 'upce' | 'code39' | 'itf';
export type QRCodeErrorCorrection = 'L' | 'M' | 'Q' | 'H';
export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = 'normal' | 'bold';
export type DividerStyle = 'solid' | 'dashed' | 'dotted';
export type ImageFitMode = 'contain' | 'cover' | 'fill';
export type SplitPaymentLayout = 'list' | 'summary';
export type LabelDataSource = 'product' | 'product_variant' | 'inventory_lot' | 'serial_number' | 'purchase_receipt' | 'warehouse_location';
export type ZebraDpi = 203 | 300 | 600;
export type TemplateAuditAction = 'created' | 'modified' | 'published' | 'archived' | 'assigned' | 'imported' | 'exported' | 'zpl_edited' | 'version_created' | 'rolled_back';

// === Base Element ===

export interface BaseElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  condition?: string;
}

// === Receipt Elements ===

export interface TextElement extends BaseElement {
  type: 'text';
  content?: string;
  variable?: string;
  fontSize: number;
  fontWeight: FontWeight;
  textAlign: TextAlign;
  fontFamily?: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src?: string;
  variable?: string;
  fitMode?: ImageFitMode;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  barcodeType: BarcodeType;
  variable?: string;
  showText?: boolean;
}

export interface QRCodeElement extends BaseElement {
  type: 'qrcode';
  variable?: string;
  errorCorrection?: QRCodeErrorCorrection;
}

export interface DividerElement extends BaseElement {
  type: 'divider';
  style?: DividerStyle;
  thickness?: number;
}

export interface SpacerElement extends BaseElement {
  type: 'spacer';
}

export interface OrderLinesElement extends BaseElement {
  type: 'order_lines';
  columns: {
    product_name: { show: boolean; width: number };
    quantity: { show: boolean; width: number };
    unit_price: { show: boolean; width: number };
    subtotal: { show: boolean; width: number };
  };
  showDiscount?: boolean;
  showSku?: boolean;
}

export interface TotalsElement extends BaseElement {
  type: 'totals';
  fields: {
    subtotal: boolean;
    discount: boolean;
    service_charge: boolean;
    tax: boolean;
    rounding: boolean;
    total: boolean;
    amount_paid: boolean;
    change: boolean;
  };
}

export interface PaymentElement extends BaseElement {
  type: 'payment';
  showMethod?: boolean;
  showAmount?: boolean;
  showReference?: boolean;
  showChange?: boolean;
  splitLayout?: SplitPaymentLayout;
}

export interface CustomerElement extends BaseElement {
  type: 'customer';
  fields: {
    name: boolean;
    phone: boolean;
    email: boolean;
    tax_id: boolean;
    loyalty_points: boolean;
  };
}

export interface StoreElement extends BaseElement {
  type: 'store';
  fields: {
    logo: boolean;
    name: boolean;
    address: boolean;
    phone: boolean;
    email: boolean;
    website: boolean;
    tax_id: boolean;
  };
}

export interface FooterElement extends BaseElement {
  type: 'footer';
  content?: string;
  showThankYou?: boolean;
  showBarcode?: boolean;
}

export type ReceiptElement =
  | TextElement
  | ImageElement
  | BarcodeElement
  | QRCodeElement
  | DividerElement
  | SpacerElement
  | OrderLinesElement
  | TotalsElement
  | PaymentElement
  | CustomerElement
  | StoreElement
  | FooterElement;

// === ZPL Label Elements ===

export interface ZplTextElement extends BaseElement {
  type: 'text';
  content?: string;
  variable?: string;
  fontSize: number;
  fontWeight: FontWeight;
  textAlign: TextAlign;
  rotation?: number;
  fontName?: string;
}

export interface ZplBarcodeElement extends BaseElement {
  type: 'barcode';
  barcodeType: BarcodeType;
  variable?: string;
  showText?: boolean;
  rotation?: number;
  moduleWidth?: number;
  barHeight?: number;
}

export interface ZplQRCodeElement extends BaseElement {
  type: 'qrcode';
  variable?: string;
  errorCorrection?: QRCodeErrorCorrection;
  rotation?: number;
  size?: number;
}

export interface ZplImageElement extends BaseElement {
  type: 'image';
  src?: string;
  variable?: string;
}

export interface ZplLineElement extends BaseElement {
  type: 'line';
  thickness?: number;
  color?: string;
}

export interface ZplBoxElement extends BaseElement {
  type: 'box';
  borderWidth?: number;
  borderColor?: string;
  filled?: boolean;
}

export interface ZplPriceElement extends BaseElement {
  type: 'price';
  variable?: string;
  fontSize?: number;
  showCurrency?: boolean;
}

export interface ZplProductElement extends BaseElement {
  type: 'product';
  fields: {
    name: boolean;
    sku: boolean;
    barcode: boolean;
    price: boolean;
    category: boolean;
    variant: boolean;
    uom: boolean;
  };
}

export interface ZplBatchElement extends BaseElement {
  type: 'batch';
  fields: {
    batch_number: boolean;
    lot_number: boolean;
    expiry_date: boolean;
    manufacturing_date: boolean;
  };
}

export interface ZplSerialElement extends BaseElement {
  type: 'serial';
  serialNumber?: string;
  showBarcode?: boolean;
}

export type ZplElement =
  | ZplTextElement
  | ZplBarcodeElement
  | ZplQRCodeElement
  | ZplImageElement
  | ZplLineElement
  | ZplBoxElement
  | ZplPriceElement
  | ZplProductElement
  | ZplBatchElement
  | ZplSerialElement;

// === Template ===

export interface TemplateCondition {
  field: string;
  operator: ConditionOperator;
  value?: string;
}

export interface PrintTemplate {
  schema_version: '1.0';
  type: PrintTemplateType;
  paper: {
    width_mm: number;
    height_mm: number | null;
    unit: 'mm';
  };
  elements: (ReceiptElement | ZplElement)[];
  conditions?: TemplateCondition[];
  metadata: {
    name: string;
    description?: string;
    author?: string;
    version: string;
  };
}

// === ZPL Specific ===

export interface ZplLabelConfig {
  width_mm: number;
  height_mm: number;
  dpi: ZebraDpi;
}

export interface ZebraPrinterProfile {
  id: string;
  name: string;
  device_id: string;
  paper_width_mm: number;
  dpi: ZebraDpi;
  connection: 'network' | 'usb' | 'serial';
  ip?: string;
  port?: number;
  port_path?: string;
  model?: string;
}

// === Database Models ===

export interface PrintTemplateRecord {
  id: string;
  name: string;
  type: PrintTemplateType;
  device_type: string;
  content: string;
  variables: string;
  paper_width: number;
  paper_height: number | null;
  is_default: number;
  is_active: number;
  schema_version: string;
  template_json: string | null;
  assigned_printer_id: string | null;
  assigned_pos_id: string | null;
  version: number;
  status: PrintTemplateStatus;
  created_by: string | null;
  publish_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintJob {
  id: string;
  uuid: string;
  template_id: string | null;
  printer_id: string | null;
  job_type: PrintJobType;
  rendered_content: string | null;
  raw_template: string | null;
  data_context: string | null;
  status: PrintJobStatus;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  printed_at: string | null;
  created_at: string;
}

export interface TemplateAuditLog {
  id: string;
  template_id: string;
  action: TemplateAuditAction;
  details: string | null;
  performed_by: string | null;
  created_at: string;
}

// === Dynamic Fields ===

export interface DynamicField {
  key: string;
  label: string;
  category: string;
}

export const RECEIPT_DYNAMIC_FIELDS: DynamicField[] = [
  { key: 'company.name', label: 'Company Name', category: 'company' },
  { key: 'company.address', label: 'Company Address', category: 'company' },
  { key: 'company.phone', label: 'Company Phone', category: 'company' },
  { key: 'company.email', label: 'Company Email', category: 'company' },
  { key: 'company.website', label: 'Company Website', category: 'company' },
  { key: 'company.tax_id', label: 'Company Tax ID', category: 'company' },
  { key: 'company.logo', label: 'Company Logo', category: 'company' },
  { key: 'pos.name', label: 'POS Name', category: 'pos' },
  { key: 'pos.session', label: 'POS Session', category: 'pos' },
  { key: 'pos.terminal', label: 'POS Terminal', category: 'pos' },
  { key: 'cashier.name', label: 'Cashier Name', category: 'cashier' },
  { key: 'cashier.id', label: 'Cashier ID', category: 'cashier' },
  { key: 'order.number', label: 'Order Number', category: 'order' },
  { key: 'order.date', label: 'Order Date', category: 'order' },
  { key: 'order.time', label: 'Order Time', category: 'order' },
  { key: 'order.type', label: 'Order Type', category: 'order' },
  { key: 'order.table', label: 'Table Number', category: 'order' },
  { key: 'order.notes', label: 'Order Notes', category: 'order' },
  { key: 'customer.name', label: 'Customer Name', category: 'customer' },
  { key: 'customer.phone', label: 'Customer Phone', category: 'customer' },
  { key: 'customer.email', label: 'Customer Email', category: 'customer' },
  { key: 'customer.tax_id', label: 'Customer Tax ID', category: 'customer' },
  { key: 'customer.loyalty_points', label: 'Loyalty Points', category: 'customer' },
  { key: 'line.product_name', label: 'Product Name', category: 'line' },
  { key: 'line.sku', label: 'SKU', category: 'line' },
  { key: 'line.barcode', label: 'Barcode', category: 'line' },
  { key: 'line.quantity', label: 'Quantity', category: 'line' },
  { key: 'line.uom', label: 'Unit of Measure', category: 'line' },
  { key: 'line.unit_price', label: 'Unit Price', category: 'line' },
  { key: 'line.discount', label: 'Discount', category: 'line' },
  { key: 'line.tax', label: 'Tax', category: 'line' },
  { key: 'line.subtotal', label: 'Subtotal', category: 'line' },
  { key: 'totals.subtotal', label: 'Subtotal', category: 'totals' },
  { key: 'totals.discount', label: 'Discount', category: 'totals' },
  { key: 'totals.service_charge', label: 'Service Charge', category: 'totals' },
  { key: 'totals.tax', label: 'Tax', category: 'totals' },
  { key: 'totals.rounding', label: 'Rounding', category: 'totals' },
  { key: 'totals.total', label: 'Grand Total', category: 'totals' },
  { key: 'totals.amount_paid', label: 'Amount Paid', category: 'totals' },
  { key: 'totals.change', label: 'Change', category: 'totals' },
  { key: 'payment.method', label: 'Payment Method', category: 'payment' },
  { key: 'payment.amount', label: 'Payment Amount', category: 'payment' },
  { key: 'payment.reference', label: 'Payment Reference', category: 'payment' },
  { key: 'loyalty.points_earned', label: 'Points Earned', category: 'loyalty' },
  { key: 'loyalty.points_redeemed', label: 'Points Redeemed', category: 'loyalty' },
];

export const LABEL_DYNAMIC_FIELDS: DynamicField[] = [
  { key: 'product.name', label: 'Product Name', category: 'product' },
  { key: 'product.sku', label: 'SKU', category: 'product' },
  { key: 'product.barcode', label: 'Barcode', category: 'product' },
  { key: 'product.price', label: 'Price', category: 'product' },
  { key: 'product.original_price', label: 'Original Price', category: 'product' },
  { key: 'product.category', label: 'Category', category: 'product' },
  { key: 'product.variant', label: 'Variant', category: 'product' },
  { key: 'product.uom', label: 'Unit of Measure', category: 'product' },
  { key: 'product.image', label: 'Product Image', category: 'product' },
  { key: 'batch.number', label: 'Batch Number', category: 'batch' },
  { key: 'batch.lot_number', label: 'Lot Number', category: 'batch' },
  { key: 'batch.expiry_date', label: 'Expiry Date', category: 'batch' },
  { key: 'batch.manufacturing_date', label: 'Manufacturing Date', category: 'batch' },
  { key: 'serial.number', label: 'Serial Number', category: 'serial' },
  { key: 'warehouse.name', label: 'Warehouse', category: 'warehouse' },
  { key: 'warehouse.location', label: 'Location', category: 'warehouse' },
  { key: 'warehouse.bin', label: 'Bin', category: 'warehouse' },
  { key: 'store.name', label: 'Store Name', category: 'store' },
  { key: 'store.address', label: 'Store Address', category: 'store' },
];
