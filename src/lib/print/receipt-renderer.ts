// Receipt renderer — template JSON → HTML / ESC/POS content array.

import type { PrintTemplate, ReceiptElement } from '@/types/print-template';
import { isElementVisible } from './condition-evaluator';

/* eslint-disable @typescript-eslint/no-explicit-any */

function escposChars(paperWidthMm: number): number {
  if (paperWidthMm >= 112) return 56;
  if (paperWidthMm >= 80) return 42;
  if (paperWidthMm >= 76) return 36;
  if (paperWidthMm >= 58) return 28;
  return 25;
}

function padLine(left: string, right: string, width: number): string {
  const l = String(left ?? '');
  const r = String(right ?? '');
  if (r.length >= width) return r;
  const maxLeft = Math.max(0, width - r.length - 1);
  const clippedLeft = l.length > maxLeft ? l.slice(0, maxLeft) : l;
  return clippedLeft + ' '.repeat(Math.max(1, width - clippedLeft.length - r.length)) + r;
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.substring(0, max - 1) + '.' : str;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPaymentMethodName(method: string): string {
  const names: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    qris: 'QRIS',
    credit: 'Credit',
    deposit: 'Deposit',
    debit: 'Debit',
    e_wallet: 'E-Wallet',
    other: 'Other',
  };
  return names[method] || method;
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

/**
 * Flatten receipt data to dotted-path format for template variable resolution.
 */
function flattenReceiptData(data: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = {};

  flat['company.name'] = data.business_name || '';
  flat['company.address'] = data.store_name || '';
  flat['company.header'] = data.receipt_header || '';
  flat['company.footer'] = data.receipt_footer || '';

  flat['order.number'] = data.transaction_no || '';
  flat['order.date'] = data.created_at ? formatDate(data.created_at) : '';
  flat['order.type'] =
    data.order_type === 'dine_in'
      ? 'Dine In'
      : data.order_type === 'takeaway'
        ? 'Takeaway'
        : data.order_type === 'delivery'
          ? 'Delivery'
          : data.order_type || '';
  flat['order.table'] = data.table_number || '';
  flat['order.notes'] = data.notes || '';

  flat['cashier.name'] = data.cashier_name || '';

  flat['customer.name'] = data.customer_name || '';
  flat['customer.code'] = data.customer_code || '';

  flat['totals.subtotal'] = formatCurrency(data.subtotal_cents || 0);
  flat['totals.discount'] = formatCurrency(data.discount_total_cents || 0);
  flat['totals.coupon_discount'] = formatCurrency(data.coupon_discount_cents || 0);
  flat['totals.tax'] = formatCurrency(data.tax_total_cents || 0);
  flat['totals.rounding'] = data.rounding_cents ? formatCurrency(data.rounding_cents) : '';
  flat['totals.total'] = formatCurrency(data.total_cents || 0);
  flat['totals.amount_paid'] = formatCurrency(data.amount_received_cents || 0);
  flat['totals.change'] = formatCurrency(data.change_cents || 0);

  flat['payment.method'] = getPaymentMethodName(data.payment_method || '');
  flat['payment.amount'] = formatCurrency(data.amount_received_cents || 0);
  flat['payment.change'] = formatCurrency(data.change_cents || 0);

  flat['coupon.code'] = data.coupon_code || '';
  flat['coupon.discount'] = formatCurrency(data.coupon_discount_cents || 0);

  flat['loyalty.points_earned'] = data.loyalty_points_earned ? String(data.loyalty_points_earned) : '';

  Object.assign(flat, data);
  return flat;
}

function resolveVariable(variable: string, data: Record<string, any>): string {
  if (!variable) return '';
  if (data[variable] !== undefined) {
    const val = data[variable];
    return val === null || val === undefined ? '' : String(val);
  }
  const parts = variable.split('.');
  let value: any = data;
  for (const part of parts) {
    if (value === null || value === undefined) return '';
    value = value[part];
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

export interface RenderOptions {
  format: 'html' | 'escpos';
  paper_width_mm: number;
  data_context: Record<string, any>;
}

export interface RenderResult {
  content: string | any[];
  format: 'html' | 'escpos';
  paper_width_mm: number;
}

/** Render a receipt template to HTML or ESC/POS. */
export function renderReceipt(template: PrintTemplate, options: RenderOptions): RenderResult {
  if (options.format === 'html') return renderToHtml(template, options);
  return renderToEscPos(template, options);
}

function renderToHtml(template: PrintTemplate, options: RenderOptions): RenderResult {
  const { data_context } = options;
  const widthMm = template.paper.width_mm;
  const flat = flattenReceiptData(data_context);

  let html = `<div class="receipt" style="width: ${widthMm}mm; font-family: monospace; font-size: 12px;">`;

  for (const element of template.elements) {
    if (!isElementVisible(element, flat)) continue;

    switch (element.type) {
      case 'text':
        html += renderTextElement(element, flat);
        break;
      case 'image':
        html += renderImageElement(element, flat);
        break;
      case 'divider':
        html += `<hr style="border: none; border-top: 1px solid #000; margin: 4px 0;">`;
        break;
      case 'spacer':
        html += `<div style="height: ${element.height}px;"></div>`;
        break;
      case 'order_lines':
        html += renderOrderLines(element, data_context);
        break;
      case 'totals':
        html += renderTotals(element, data_context);
        break;
      case 'payment':
        html += renderPayment(element, data_context);
        break;
      case 'customer':
        html += renderCustomer(element, data_context);
        break;
      case 'store':
        html += renderStore(element, data_context);
        break;
      case 'footer':
        html += renderFooter(element, flat);
        break;
      case 'barcode':
      case 'qrcode':
        html += `<div class="${element.type}" style="text-align: center;">[${element.type}]</div>`;
        break;
    }
  }

  html += `</div>`;
  return { content: html, format: 'html', paper_width_mm: widthMm };
}

function renderToEscPos(template: PrintTemplate, options: RenderOptions): RenderResult {
  const { data_context } = options;
  const content: any[] = [];
  const maxChars = escposChars(template.paper.width_mm || options.paper_width_mm || 80);
  const flat = flattenReceiptData(data_context);

  // Stable sort by y-coordinate.
  const sorted = [...template.elements]
    .filter((el) => el.visible !== false)
    .map((el, i) => ({ el, i }))
    .sort((a, b) => ((a.el as any).y || 0) - ((b.el as any).y || 0) || a.i - b.i)
    .map(({ el }) => el);

  for (const element of sorted) {
    if (!isElementVisible(element, flat)) continue;

    switch (element.type) {
      case 'text': {
        const text = element.variable
          ? resolveVariable(element.variable, flat)
          : (element as any).content || '';
        if (!text) break;
        content.push({
          type: 'text',
          value: truncate(text, maxChars),
          style: { bold: element.fontWeight === 'bold', align: element.textAlign || 'left' },
        });
        break;
      }
      case 'divider':
        content.push({ type: 'line', width: maxChars });
        break;
      case 'spacer':
        content.push({ type: 'feed', lines: 1 });
        break;
      case 'order_lines': {
        const items = data_context.items || [];
        for (const item of items) {
          content.push({ type: 'text', value: truncate(item.product_name || '', maxChars), style: { bold: true } });
          if (item.variant) content.push({ type: 'text', value: '  ' + item.variant });
          if (item.is_free_item) {
            content.push({ type: 'text', value: padLine(`${item.quantity} x ${formatCurrency(0)}`, 'FREE', maxChars) });
          } else {
            const totalDiscount = (item.discount_amount_cents || 0) + (item.promo_discount_cents || 0);
            content.push({
              type: 'text',
              value: padLine(
                `${item.quantity} x ${formatCurrency(item.unit_price_cents || item.unit_price || 0)}`,
                formatCurrency(item.line_total_cents || item.subtotal || item.total || 0),
                maxChars
              ),
            });
            if (totalDiscount > 0) {
              content.push({ type: 'text', value: padLine('', `-${formatCurrency(totalDiscount)}`, maxChars) });
            }
          }
          if (item.notes) content.push({ type: 'text', value: '  Note: ' + item.notes });
        }
        break;
      }
      case 'totals': {
        const fields: any = (element as any).fields || {};
        if (fields.subtotal !== false) {
          content.push({ type: 'text', value: padLine('Subtotal', formatCurrency(data_context.subtotal_cents || 0), maxChars) });
        }
        if (fields.discount !== false && (data_context.discount_total_cents || 0) > 0) {
          content.push({ type: 'text', value: padLine('Discount', '-' + formatCurrency(data_context.discount_total_cents || 0), maxChars) });
        }
        if (data_context.coupon_code && (data_context.coupon_discount_cents || 0) > 0) {
          content.push({ type: 'text', value: padLine(`Coupon ${data_context.coupon_code}`, '-' + formatCurrency(data_context.coupon_discount_cents || 0), maxChars) });
        }
        if ((data_context.loyalty_points_earned || 0) > 0) {
          content.push({ type: 'text', value: padLine(`Loyalty ${data_context.loyalty_points_earned}pts`, '-0', maxChars) });
        }
        if (fields.tax !== false) {
          content.push({ type: 'text', value: padLine('Tax', formatCurrency(data_context.tax_total_cents || 0), maxChars) });
        }
        if (fields.rounding !== false && (data_context.rounding_cents || 0) !== 0) {
          content.push({
            type: 'text',
            value: padLine('Rounding', ((data_context.rounding_cents || 0) > 0 ? '+' : '') + formatCurrency(data_context.rounding_cents || 0), maxChars),
          });
        }
        if (fields.total !== false) {
          content.push({ type: 'line', width: maxChars });
          content.push({ type: 'text', value: padLine('TOTAL', formatCurrency(data_context.total_cents || 0), maxChars), style: { bold: true } });
        }
        break;
      }
      case 'payment': {
        if (data_context.payments && data_context.payments.length > 1) {
          content.push({ type: 'text', value: 'PAYMENT', style: { bold: true } });
          for (const p of data_context.payments) {
            content.push({ type: 'text', value: padLine(getPaymentMethodName(p.method), formatCurrency(p.amount_cents || p.amount || 0), maxChars) });
          }
        } else if (data_context.payment_method) {
          content.push({ type: 'text', value: padLine('Payment', getPaymentMethodName(data_context.payment_method), maxChars) });
        }
        if (data_context.amount_received_cents) {
          content.push({ type: 'text', value: padLine('Received', formatCurrency(data_context.amount_received_cents), maxChars) });
        }
        if ((data_context.change_cents || 0) > 0) {
          content.push({ type: 'text', value: padLine('Change', formatCurrency(data_context.change_cents), maxChars), style: { bold: true } });
        }
        break;
      }
      case 'customer': {
        const fields: any = (element as any).fields || {};
        if (fields.name !== false && data_context.customer_name) {
          content.push({ type: 'text', value: `Customer: ${data_context.customer_name}` });
        }
        if (fields.phone && data_context.customer_phone) {
          content.push({ type: 'text', value: `Phone: ${data_context.customer_phone}` });
        }
        if (fields.email && data_context.customer_email) {
          content.push({ type: 'text', value: `Email: ${data_context.customer_email}` });
        }
        if (fields.tax_id && data_context.customer_tax_id) {
          content.push({ type: 'text', value: `Tax ID: ${data_context.customer_tax_id}` });
        }
        if (fields.loyalty_points && data_context.loyalty_points_earned) {
          content.push({ type: 'text', value: `Points: ${data_context.loyalty_points_earned}` });
        }
        break;
      }
      case 'store': {
        const fields: any = (element as any).fields || {};
        const storeStyle: Record<string, any> = { align: 'center', bold: true };
        if (maxChars >= 44) storeStyle.width = 2;
        if (fields.name !== false) {
          content.push({
            type: 'text',
            value: truncate(data_context.business_name || data_context.store_name || '', maxChars),
            style: storeStyle,
          });
        }
        if (fields.address !== false && data_context.store_name && data_context.business_name !== data_context.store_name) {
          content.push({ type: 'text', value: truncate(data_context.store_name, maxChars), style: { align: 'center' } });
        }
        if (fields.phone && data_context.store_phone) content.push({ type: 'text', value: data_context.store_phone, style: { align: 'center' } });
        if (fields.email && data_context.store_email) content.push({ type: 'text', value: data_context.store_email, style: { align: 'center' } });
        if (fields.website && data_context.store_website) content.push({ type: 'text', value: data_context.store_website, style: { align: 'center' } });
        if (fields.tax_id && data_context.store_tax_id) content.push({ type: 'text', value: `Tax ID: ${data_context.store_tax_id}`, style: { align: 'center' } });
        if (data_context.receipt_header) content.push({ type: 'text', value: truncate(data_context.receipt_header, maxChars), style: { align: 'center' } });
        break;
      }
      case 'footer': {
        if ((element as any).showThankYou !== false) {
          content.push({ type: 'text', value: 'Thank you for your purchase!', style: { align: 'center' } });
        }
        if ((element as any).content) content.push({ type: 'text', value: (element as any).content, style: { align: 'center' } });
        if (data_context.receipt_footer) content.push({ type: 'text', value: truncate(data_context.receipt_footer, maxChars), style: { align: 'center' } });
        break;
      }
      case 'barcode':
      case 'qrcode':
      case 'image':
        // Graphics not supported by the text-only ESC/POS buffer; skip.
        break;
    }
  }

  content.push({ type: 'feed', lines: 3 });
  content.push({ type: 'cut' });

  return { content, format: 'escpos', paper_width_mm: template.paper.width_mm };
}

// === Element Renderers (HTML) ===

function renderTextElement(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'text') return '';
  const text = element.variable ? resolveVariable(element.variable, data) : element.content || '';
  if (!text) return '';
  const align = element.textAlign || 'left';
  const weight = element.fontWeight === 'bold' ? 'font-weight: bold;' : '';
  return `<div style="text-align: ${align}; ${weight} font-size: ${element.fontSize || 12}px;">${escapeHtml(text)}</div>`;
}

function renderImageElement(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'image') return '';
  const src = element.variable ? resolveVariable(element.variable, data) : (element as any).src;
  if (!src) return '';
  return `<div style="text-align: center;"><img src="${src}" style="max-width: ${element.width}mm; max-height: ${element.height}mm;"></div>`;
}

function renderOrderLines(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'order_lines') return '';
  const items = data.items || [];
  let html = '<table style="width: 100%; font-size: 11px;">';
  html += '<tr><th style="text-align: left;">Item</th><th style="text-align: right;">Qty</th><th style="text-align: right;">Total</th></tr>';

  for (const item of items) {
    const name = item.product_name || '';
    const qty = item.quantity || 0;
    const total = formatCurrency(item.line_total_cents || item.subtotal || item.total || 0);
    const discount = (item.discount_amount_cents || 0) + (item.promo_discount_cents || 0);
    const free = item.is_free_item ? ' <span style="color: green; font-weight: bold;">FREE</span>' : '';
    html += `<tr><td>${escapeHtml(name)}${free}</td><td style="text-align: right;">${qty}</td><td style="text-align: right;">${total}</td></tr>`;
    if (discount > 0) {
      html += `<tr><td colspan="2"></td><td style="text-align: right; color: red;">-${formatCurrency(discount)}</td></tr>`;
    }
    if (item.variant) html += `<tr><td style="font-size: 10px; color: #666;">  ${escapeHtml(item.variant)}</td><td colspan="2"></td></tr>`;
    if (item.notes) html += `<tr><td style="font-size: 10px; color: #666;">  Note: ${escapeHtml(item.notes)}</td><td colspan="2"></td></tr>`;
  }

  html += '</table>';
  return html;
}

function renderTotals(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'totals') return '';
  const fields: any = (element as any).fields || {};
  let html = '<div class="totals">';

  if (fields.subtotal !== false) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Subtotal</span><span>${formatCurrency(data.subtotal_cents || 0)}</span></div>`;
  }
  if (fields.discount !== false && (data.discount_total_cents || 0) > 0) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Discount</span><span>-${formatCurrency(data.discount_total_cents || 0)}</span></div>`;
  }
  if (data.coupon_code && (data.coupon_discount_cents || 0) > 0) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Coupon ${data.coupon_code}</span><span>-${formatCurrency(data.coupon_discount_cents || 0)}</span></div>`;
  }
  if ((data.loyalty_points_earned || 0) > 0) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Loyalty ${data.loyalty_points_earned}pts</span><span>-0</span></div>`;
  }
  if (fields.tax !== false) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Tax</span><span>${formatCurrency(data.tax_total_cents || 0)}</span></div>`;
  }
  if (fields.rounding !== false && (data.rounding_cents || 0) !== 0) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Rounding</span><span>${(data.rounding_cents || 0) > 0 ? '+' : ''}${formatCurrency(data.rounding_cents || 0)}</span></div>`;
  }
  if (fields.total !== false) {
    html += `<div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #000; padding-top: 4px;"><span>TOTAL</span><span>${formatCurrency(data.total_cents || 0)}</span></div>`;
  }

  html += '</div>';
  return html;
}

function renderPayment(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'payment') return '';
  const payments = data.payments || [];

  let html = '<div class="payment">';
  if (payments.length > 1) {
    html += '<div style="font-weight: bold;">PAYMENT</div>';
    for (const p of payments) {
      html += `<div style="display: flex; justify-content: space-between;"><span>${escapeHtml(getPaymentMethodName(p.method))}</span><span>${formatCurrency(p.amount_cents || p.amount || 0)}</span></div>`;
    }
  } else if (data.payment_method) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Payment</span><span>${escapeHtml(getPaymentMethodName(data.payment_method))}</span></div>`;
  }
  if (data.amount_received_cents) {
    html += `<div style="display: flex; justify-content: space-between;"><span>Received</span><span>${formatCurrency(data.amount_received_cents)}</span></div>`;
  }
  if ((data.change_cents || 0) > 0) {
    html += `<div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Change</span><span>${formatCurrency(data.change_cents)}</span></div>`;
  }
  html += '</div>';
  return html;
}

function renderCustomer(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'customer') return '';
  const fields: any = (element as any).fields || {};
  let html = '<div class="customer">';
  if (fields.name !== false && data.customer_name) html += `<div>Customer: ${escapeHtml(data.customer_name)}</div>`;
  if (fields.phone && data.customer_phone) html += `<div>Phone: ${escapeHtml(data.customer_phone)}</div>`;
  if (fields.email && data.customer_email) html += `<div>Email: ${escapeHtml(data.customer_email)}</div>`;
  if (fields.tax_id && data.customer_tax_id) html += `<div>Tax ID: ${escapeHtml(data.customer_tax_id)}</div>`;
  if (fields.loyalty_points && data.loyalty_points_earned) html += `<div>Points: ${data.loyalty_points_earned}</div>`;
  html += '</div>';
  return html;
}

function renderStore(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'store') return '';
  const fields: any = (element as any).fields || {};
  let html = '<div class="store" style="text-align: center;">';
  if (fields.logo && data.store_logo) html += `<div><img src="${data.store_logo}" style="max-height: 20mm;"></div>`;
  if (fields.name !== false) html += `<div style="font-weight: bold; font-size: 14px;">${escapeHtml(data.business_name || data.store_name || '')}</div>`;
  if (fields.address !== false && data.store_name && data.business_name !== data.store_name) html += `<div style="font-size: 10px;">${escapeHtml(data.store_name)}</div>`;
  if (fields.phone && data.store_phone) html += `<div style="font-size: 10px;">${escapeHtml(data.store_phone)}</div>`;
  if (fields.email && data.store_email) html += `<div style="font-size: 10px;">${escapeHtml(data.store_email)}</div>`;
  if (fields.website && data.store_website) html += `<div style="font-size: 10px;">${escapeHtml(data.store_website)}</div>`;
  if (fields.tax_id && data.store_tax_id) html += `<div style="font-size: 10px;">Tax ID: ${escapeHtml(data.store_tax_id)}</div>`;
  if (data.receipt_header) html += `<div style="font-size: 10px; margin-top: 4px;">${escapeHtml(data.receipt_header)}</div>`;
  html += '</div>';
  return html;
}

function renderFooter(element: ReceiptElement, data: Record<string, any>): string {
  if (element.type !== 'footer') return '';
  let html = '<div class="footer" style="text-align: center; margin-top: 8px;">';
  if ((element as any).showThankYou !== false) html += '<div>Thank you for your purchase!</div>';
  if ((element as any).content) html += `<div>${escapeHtml((element as any).content)}</div>`;
  if (data.receipt_footer) html += `<div>${escapeHtml(data.receipt_footer)}</div>`;
  html += '</div>';
  return html;
}
