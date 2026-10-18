// ZPL generator — template JSON → ZPL code for Zebra label printers.

import type { PrintTemplate } from '@/types/print-template';
import { isElementVisible } from './condition-evaluator';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ZplGenerateOptions {
  dpi: 203 | 300 | 600;
  label_width_mm: number;
  label_height_mm: number;
  data_context: Record<string, any>;
}

export interface ZplGenerateResult {
  zpl: string;
  label_width_dots: number;
  label_height_dots: number;
  dpi: number;
}

/** Convert millimeters to dots at a given DPI. */
function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/** Generate ZPL code from a label template. */
export function generateZpl(template: PrintTemplate, options: ZplGenerateOptions): ZplGenerateResult {
  const { dpi, label_width_mm, label_height_mm, data_context } = options;
  const widthDots = mmToDots(label_width_mm, dpi);
  const heightDots = mmToDots(label_height_mm, dpi);

  let zpl = '^XA\n'; // Start of label
  zpl += `^PW${widthDots}\n`;
  zpl += `^LL${heightDots}\n`;
  zpl += '^LS0\n'; // Label home offset

  for (const element of template.elements) {
    if (!isElementVisible(element, data_context)) continue;
    if (!isZplElement(element)) continue;
    zpl += generateElementZpl(element, dpi, data_context);
  }

  zpl += '^XZ\n'; // End of label

  return { zpl, label_width_dots: widthDots, label_height_dots: heightDots, dpi };
}

function isZplElement(element: any): boolean {
  return [
    'zpl_text', 'text',
    'zpl_barcode', 'barcode',
    'zpl_qrcode', 'qrcode',
    'zpl_image', 'image',
    'zpl_line', 'line',
    'zpl_box', 'box',
    'zpl_price', 'price',
    'zpl_product', 'product',
    'zpl_batch', 'batch',
    'zpl_serial', 'serial',
  ].includes(element.type);
}

function generateElementZpl(element: any, dpi: number, data: Record<string, any>): string {
  const xDots = mmToDots(element.x, dpi);
  const yDots = mmToDots(element.y, dpi);

  switch (element.type) {
    case 'text':
    case 'zpl_text':
      return generateTextZpl(element, xDots, yDots, data);
    case 'barcode':
    case 'zpl_barcode':
      return generateBarcodeZpl(element, xDots, yDots, data);
    case 'qrcode':
    case 'zpl_qrcode':
      return generateQRCodeZpl(element, xDots, yDots, data);
    case 'line':
    case 'zpl_line':
      return generateLineZpl(element, xDots, yDots);
    case 'box':
    case 'zpl_box':
      return generateBoxZpl(element, xDots, yDots);
    case 'image':
    case 'zpl_image':
      return generateImageZpl(element, xDots, yDots);
    case 'price':
    case 'zpl_price':
      return generatePriceZpl(element, xDots, yDots, data);
    case 'product':
    case 'zpl_product':
      return generateProductZpl(element, xDots, yDots, data, dpi);
    case 'batch':
    case 'zpl_batch':
      return generateBatchZpl(element, xDots, yDots, data);
    case 'serial':
    case 'zpl_serial':
      return generateSerialZpl(element, xDots, yDots, data);
    default:
      return '';
  }
}

function generateTextZpl(element: any, x: number, y: number, data: Record<string, any>): string {
  const text = element.variable ? resolveVariable(element.variable, data) : element.content || '';
  if (!text) return '';

  const fontSize = element.fontSize || 14;
  const fontName = element.fontName || 'A';
  const rotation = element.rotation || 0;
  const rotationCode = rotation === 90 ? 'R' : rotation === 180 ? 'I' : rotation === 270 ? 'B' : 'N';

  let zpl = `^FO${x},${y}\n`;
  zpl += `^A${fontName}${rotationCode},${fontSize},${fontSize}\n`;
  zpl += `^FD${escapeZpl(text)}^FS\n`;
  return zpl;
}

function generateBarcodeZpl(element: any, x: number, y: number, data: Record<string, any>): string {
  const barcodeData = element.variable ? resolveVariable(element.variable, data) : '';
  if (!barcodeData) return '';

  const height = element.barHeight || 80;
  const moduleWidth = element.moduleWidth || 2;
  const rotation = element.rotation || 0;
  const showText = element.showText !== false;
  const rotationCode = rotation === 90 ? 'R' : rotation === 180 ? 'I' : rotation === 270 ? 'B' : 'N';

  let barcodeType = 'N'; // Default Code128
  switch (element.barcodeType) {
    case 'code128': barcodeType = 'C'; break;
    case 'ean13': barcodeType = 'E'; break;
    case 'ean8': barcodeType = '8'; break;
    case 'upca': barcodeType = 'A'; break;
    case 'upce': barcodeType = 'E'; break;
    case 'code39': barcodeType = '3'; break;
    case 'itf': barcodeType = 'I'; break;
  }

  let zpl = `^FO${x},${y}\n`;
  zpl += `^BY${moduleWidth}\n`;
  zpl += `^B${barcodeType}${rotationCode},${height},${showText ? 'Y' : 'N'},N,N\n`;
  zpl += `^FD${escapeZpl(barcodeData)}^FS\n`;
  return zpl;
}

function generateQRCodeZpl(element: any, x: number, y: number, data: Record<string, any>): string {
  const qrData = element.variable ? resolveVariable(element.variable, data) : '';
  if (!qrData) return '';

  const size = element.size || 3;
  const rotation = element.rotation || 0;
  const rotationCode = rotation === 90 ? 'R' : rotation === 180 ? 'I' : rotation === 270 ? 'B' : 'N';

  let zpl = `^FO${x},${y}\n`;
  zpl += `^BQN,${rotationCode},${size}\n`;
  zpl += `^FDQA,${escapeZpl(qrData)}^FS\n`;
  return zpl;
}

function generateLineZpl(element: any, x: number, y: number): string {
  const widthDots = mmToDots(element.width, 203);
  const thickness = element.thickness || 2;
  return `^FO${x},${y}\n^GB${widthDots},${thickness},${thickness}^FS\n`;
}

function generateBoxZpl(element: any, x: number, y: number): string {
  const widthDots = mmToDots(element.width, 203);
  const heightDots = mmToDots(element.height, 203);
  const borderWidth = element.borderWidth || 2;
  return `^FO${x},${y}\n^GB${widthDots},${heightDots},${borderWidth}^FS\n`;
}

function generatePriceZpl(element: any, x: number, y: number, data: Record<string, any>): string {
  const price = element.variable ? resolveVariable(element.variable, data) : '';
  const showCurrency = element.showCurrency !== false;
  const fontSize = element.fontSize || 24;

  let text = price;
  if (showCurrency && !text.startsWith('Rp')) text = `Rp ${text}`;

  let zpl = `^FO${x},${y}\n`;
  zpl += `^A0N,${fontSize},${fontSize}\n`;
  zpl += `^FD${escapeZpl(text)}^FS\n`;
  return zpl;
}

function generateImageZpl(element: any, x: number, y: number): string {
  // Pre-converted ^GFA (see zpl-image.ts) takes precedence.
  if (element.gfa) return `^FO${x},${y}\n${element.gfa}\n^FS\n`;
  return `^FO${x},${y}\n^A0N,20,20\n^FD[Image]^FS\n`;
}

function generateProductZpl(element: any, x: number, y: number, data: Record<string, any>, dpi: number): string {
  const fields = element.fields || {};
  const product = data.product || data;
  const lines: string[] = [];
  let cursor = y;
  const push = (value: any, size = 20) => {
    if (value === undefined || value === null || value === '') return;
    lines.push(`^FO${x},${cursor}\n^A0N,${size},${size}\n^FD${escapeZpl(String(value))}^FS`);
    cursor += size + 4;
  };

  if (fields.name) push(product.name, 24);
  if (fields.sku) push(product.sku, 18);
  if (fields.variant) push(product.variant, 18);
  if (fields.category) push(product.category, 18);
  if (fields.uom) push(product.uom, 18);
  if (fields.price) push(product.price, 22);
  if (fields.barcode && product.barcode) {
    lines.push(`^FO${x},${cursor}\n^BY2^BCN,60,Y,N,N\n^FD${escapeZpl(String(product.barcode))}^FS`);
    cursor += mmToDots(10, dpi);
  }
  return lines.map((l) => l + '\n').join('');
}

function generateBatchZpl(element: any, x: number, y: number, data: Record<string, any>): string {
  const fields = element.fields || {};
  const batch = data.batch || {};
  const lines: string[] = [];
  let cursor = y;
  const push = (label: string, value: any) => {
    if (value === undefined || value === null || value === '') return;
    lines.push(`^FO${x},${cursor}\n^A0N,20,20\n^FD${escapeZpl(`${label}: ${value}`)}^FS`);
    cursor += 24;
  };

  if (fields.batch_number) push('Batch', batch.batch_number ?? batch.number);
  if (fields.lot_number) push('Lot', batch.lot_number);
  if (fields.expiry_date) push('Expiry', batch.expiry_date);
  if (fields.manufacturing_date) push('Mfg', batch.manufacturing_date);
  return lines.map((l) => l + '\n').join('');
}

function generateSerialZpl(element: any, x: number, y: number, data: Record<string, any>): string {
  const serial = element.serialNumber || data.serial?.number || data.serial_number;
  if (!serial) return '';
  let zpl = `^FO${x},${y}\n^A0N,24,24\n^FD${escapeZpl(String(serial))}^FS\n`;
  if (element.showBarcode) {
    zpl += `^FO${x},${y + 30}\n^BY2^BCN,60,Y,N,N\n^FD${escapeZpl(String(serial))}^FS\n`;
  }
  return zpl;
}

function resolveVariable(variable: string, data: Record<string, any>): string {
  const parts = variable.split('.');
  let value: any = data;
  for (const part of parts) {
    if (value === null || value === undefined) return '';
    value = value[part];
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

function escapeZpl(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\^/g, '\\^').replace(/~/g, '\\~');
}
