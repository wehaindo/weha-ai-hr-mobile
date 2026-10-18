// Receipt/report content builders — produce `PrintContentItem[]` that
// `buildEscPosBytes` compiles to raw ESC/POS bytes. Currency formatting is
// injected (no store dependency) so a device app supplies its own config.

import type { PrintContentItem, PrintContentStyle } from './escpos-buffer';

/** Currency display config supplied by the caller. */
export interface CurrencyConfig {
  /** ISO code, used only for the locale default; ignored when symbol given. */
  code?: string;
  symbol?: string;
  /** Decimal places for minor units (money is stored as integer cents). */
  decimalPlaces?: number;
  /** 'prefix' → "$ 12.34"; 'suffix' → "12.34 $". Defaults to prefix. */
  position?: 'prefix' | 'suffix';
}

const DEFAULT_CURRENCY: Required<Pick<CurrencyConfig, 'symbol' | 'decimalPlaces' | 'position'>> = {
  symbol: 'Rp',
  decimalPlaces: 0,
  position: 'prefix',
};

export interface ReceiptItem {
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  discount_amount_cents: number;
  promo_discount_cents?: number;
  is_free_item?: boolean;
}

export interface ReceiptPayment {
  method: string;
  amount_cents: number;
}

export interface ReceiptData {
  store_name: string;
  business_name: string;
  receipt_header?: string;
  receipt_footer?: string;
  transaction_no: string;
  created_at: string;
  cashier_name: string;
  customer_name?: string;
  order_type?: string;
  table_number?: string;
  items: ReceiptItem[];
  subtotal_cents: number;
  discount_total_cents: number;
  tax_total_cents: number;
  total_cents: number;
  rounding_cents?: number;
  payments: ReceiptPayment[];
  change_cents: number;
  loyalty_points_earned?: number;
  coupon_code?: string;
  coupon_discount_cents?: number;
  notes?: string;
}

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  qris: 'QRIS',
  credit: 'Customer Credit',
  deposit: 'Deposit',
  other: 'Other',
};

// Map paper width (mm) → max printable characters per line, with a safety
// margin so right-aligned prices are never clipped.
export function getMaxChars(paperWidth: number): number {
  if (paperWidth >= 80) return 42;
  if (paperWidth >= 76) return 36;
  if (paperWidth >= 58) return 28;
  return 25;
}

export function formatPrice(cents: number, cfg: CurrencyConfig = DEFAULT_CURRENCY): string {
  const symbol = cfg.symbol ?? DEFAULT_CURRENCY.symbol;
  const dp = cfg.decimalPlaces ?? DEFAULT_CURRENCY.decimalPlaces;
  const position = cfg.position ?? DEFAULT_CURRENCY.position;
  const amount = (cents || 0) / Math.pow(10, dp);
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  return position === 'suffix' ? `${formatted} ${symbol}` : `${symbol} ${formatted}`;
}

function truncate(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  return str.substring(0, Math.max(0, maxChars - 1)) + '.';
}

function formatLine(left: string, right: string, width: number): string {
  let r = right;
  if (r.length > width) r = r.substring(0, width);
  const maxLeft = Math.max(0, width - r.length - 1);
  const l = left.length > maxLeft ? left.substring(0, maxLeft) : left;
  const gap = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(gap) + r;
}

function separator(maxChars: number): PrintContentItem {
  return { type: 'line', width: maxChars };
}

function emptyLine(): PrintContentItem {
  return { type: 'text', value: '' };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

/** Build a full receipt as a content array. */
export function buildReceiptContent(
  receipt: ReceiptData,
  paperWidth = 80,
  currency: CurrencyConfig = DEFAULT_CURRENCY
): PrintContentItem[] {
  const W = getMaxChars(paperWidth);
  const price = (cents: number) => formatPrice(cents, currency);
  const content: PrintContentItem[] = [];

  const storeName = receipt.business_name || receipt.store_name;
  const storeStyle: PrintContentStyle = { align: 'center', bold: true };
  if (W >= 44) storeStyle.width = 2;
  content.push({ type: 'text', value: truncate(storeName, W), style: storeStyle });

  if (receipt.business_name && receipt.store_name && receipt.business_name !== receipt.store_name) {
    content.push({ type: 'text', value: truncate(receipt.store_name, W), style: { align: 'center' } });
  }

  if (receipt.receipt_header) {
    content.push({ type: 'text', value: truncate(receipt.receipt_header, W), style: { align: 'center' } });
  }

  content.push(emptyLine());
  content.push(separator(W));
  content.push({ type: 'text', value: formatLine('No:', receipt.transaction_no, W) });
  content.push({ type: 'text', value: formatLine('Date:', formatDate(receipt.created_at), W) });
  content.push({ type: 'text', value: formatLine('Cashier:', receipt.cashier_name || '-', W) });

  if (receipt.customer_name) content.push({ type: 'text', value: formatLine('Customer:', receipt.customer_name, W) });
  if (receipt.order_type) {
    const label = receipt.order_type === 'dine_in' ? 'Dine In' : receipt.order_type === 'takeaway' ? 'Takeaway' : 'Delivery';
    content.push({ type: 'text', value: formatLine('Order:', label, W) });
  }
  if (receipt.table_number) content.push({ type: 'text', value: formatLine('Table:', receipt.table_number, W) });

  content.push(separator(W));
  content.push(emptyLine());
  content.push({ type: 'text', value: formatLine('Item', 'Total', W), style: { bold: true } });
  content.push(emptyLine());

  for (const item of receipt.items) {
    content.push({ type: 'text', value: truncate(item.product_name, W), style: { bold: true } });

    if (item.is_free_item) {
      content.push({ type: 'text', value: formatLine(`${item.quantity} x ${price(0)}`, 'FREE', W) });
    } else {
      const totalDiscount = (item.discount_amount_cents || 0) + (item.promo_discount_cents || 0);
      if (totalDiscount > 0) {
        const originalUnit = item.unit_price_cents + Math.round(totalDiscount / item.quantity);
        content.push({
          type: 'text',
          value: formatLine(`${item.quantity} x ${price(item.unit_price_cents)}`, price(item.line_total_cents), W),
        });
        content.push({
          type: 'text',
          value: `  was ${price(originalUnit)} each (-${price(totalDiscount)})`,
          style: { bold: false },
        });
      } else {
        content.push({
          type: 'text',
          value: formatLine(`${item.quantity} x ${price(item.unit_price_cents)}`, price(item.line_total_cents), W),
        });
      }
    }
  }

  content.push(separator(W));
  content.push({ type: 'text', value: formatLine('Subtotal', price(receipt.subtotal_cents), W) });

  if (receipt.discount_total_cents > 0) {
    content.push({ type: 'text', value: formatLine('Discount', `-${price(receipt.discount_total_cents)}`, W) });
  }
  if (receipt.coupon_code && receipt.coupon_discount_cents) {
    content.push({ type: 'text', value: formatLine(`Coupon (${receipt.coupon_code})`, `-${price(receipt.coupon_discount_cents)}`, W) });
  }
  if (receipt.tax_total_cents > 0) {
    content.push({ type: 'text', value: formatLine('Tax', price(receipt.tax_total_cents), W) });
  }
  if (receipt.rounding_cents && receipt.rounding_cents !== 0) {
    const sign = receipt.rounding_cents > 0 ? '+' : '';
    content.push({ type: 'text', value: formatLine('Rounding', `${sign}${price(receipt.rounding_cents)}`, W) });
  }

  content.push(separator(W));
  content.push({ type: 'text', value: formatLine('TOTAL', price(receipt.total_cents), W), style: { bold: true } });
  content.push(separator(W));
  content.push(emptyLine());

  if (receipt.payments && receipt.payments.length > 1) {
    content.push({ type: 'text', value: 'Payment:', style: { bold: true } });
    for (const p of receipt.payments) {
      const methodName = PAYMENT_METHOD_NAMES[p.method] || p.method;
      content.push({ type: 'text', value: formatLine(`  ${methodName}`, price(p.amount_cents), W) });
    }
  } else if (receipt.payments && receipt.payments.length === 1) {
    const methodName = PAYMENT_METHOD_NAMES[receipt.payments[0].method] || receipt.payments[0].method;
    content.push({ type: 'text', value: formatLine('Payment', methodName, W) });
    content.push({ type: 'text', value: formatLine('Received', price(receipt.payments[0].amount_cents), W) });
  } else {
    content.push({ type: 'text', value: formatLine('Payment', price(receipt.total_cents), W) });
  }

  if (receipt.change_cents > 0) {
    content.push({ type: 'text', value: formatLine('Change', price(receipt.change_cents), W), style: { bold: true } });
  }

  if (receipt.loyalty_points_earned && receipt.loyalty_points_earned > 0) {
    content.push(emptyLine());
    content.push({
      type: 'text',
      value: truncate(`+${receipt.loyalty_points_earned} Points Earned`, W),
      style: { align: 'center', bold: true },
    });
  }

  if (receipt.notes) {
    content.push(emptyLine());
    content.push({ type: 'text', value: `Note: ${truncate(receipt.notes, W)}` });
  }

  content.push(emptyLine());
  content.push(separator(W));

  if (receipt.receipt_footer) {
    content.push({ type: 'text', value: truncate(receipt.receipt_footer, W), style: { align: 'center' } });
  }
  content.push({ type: 'text', value: truncate('Thank you for your purchase!', W), style: { align: 'center' } });

  content.push({ type: 'feed', lines: 3 });
  content.push({ type: 'cut' });

  return content;
}

/** Build a printer test page as a content array. */
export function buildTestReceiptContent(printerName: string, paperWidth = 80): PrintContentItem[] {
  const W = getMaxChars(paperWidth);
  const storeStyle: PrintContentStyle = { align: 'center', bold: true };
  if (W >= 44) storeStyle.width = 2;
  return [
    { type: 'text', value: 'TEST PRINT', style: storeStyle },
    emptyLine(),
    separator(W),
    { type: 'text', value: truncate(printerName, W), style: { align: 'center' } },
    { type: 'text', value: formatDate(new Date().toISOString()), style: { align: 'center' } },
    separator(W),
    emptyLine(),
    { type: 'text', value: 'This is a test print.', style: { align: 'center' } },
    { type: 'text', value: 'If you can read this, the printer works.', style: { align: 'center' } },
    emptyLine(),
    separator(W),
    emptyLine(),
    { type: 'text', value: '1234567890', style: { align: 'center' } },
    { type: 'text', value: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', style: { align: 'center' } },
    emptyLine(),
    { type: 'text', value: 'Bold Text', style: { align: 'center', bold: true } },
    { type: 'text', value: 'Double Width', style: { align: 'center', width: W >= 44 ? 2 : 1 } },
    { type: 'feed', lines: 3 },
    { type: 'cut' },
  ];
}
