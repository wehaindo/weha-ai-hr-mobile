// ZPL image conversion — raster image (data URL / http URL) → uncompressed
// monochrome ^GFA graphic field for Zebra printers.

import { generateZpl, type ZplGenerateOptions, type ZplGenerateResult } from './zpl-generator';
import type { PrintTemplate } from '@/types/print-template';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GfaResult {
  gfa: string;
  width_dots: number;
  height_dots: number;
  bytes_per_row: number;
}

function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Convert an image into a 1-bit ^GFA graphic field at the requested dot width. */
export async function imageToGfa(
  src: string,
  options: { width_mm: number; dpi: number; threshold?: number }
): Promise<GfaResult> {
  if (typeof document === 'undefined') {
    throw new Error('Image conversion requires a browser/canvas environment');
  }

  const img = await loadImage(src);
  const widthDots = Math.max(1, mmToDots(options.width_mm, options.dpi));
  const ratio = img.naturalHeight / (img.naturalWidth || 1);
  const heightDots = Math.max(1, Math.round(widthDots * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthDots, heightDots);
  ctx.drawImage(img, 0, 0, widthDots, heightDots);

  const data = ctx.getImageData(0, 0, widthDots, heightDots).data;
  const threshold = options.threshold ?? 160;
  const bytesPerRow = Math.ceil(widthDots / 8);
  const bytes = new Uint8Array(bytesPerRow * heightDots);

  for (let y = 0; y < heightDots; y++) {
    for (let x = 0; x < widthDots; x++) {
      const idx = (y * widthDots + x) * 4;
      const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (luminance < threshold) {
        bytes[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }

  const totalBytes = bytes.length;
  const gfa = `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hex}`;
  return { gfa, width_dots: widthDots, height_dots: heightDots, bytes_per_row: bytesPerRow };
}

/** Async ZPL generation that pre-converts image elements to ^GFA. */
export async function generateZplAsync(
  template: PrintTemplate,
  options: ZplGenerateOptions,
  resolveImageSrc?: (element: any) => string | undefined
): Promise<ZplGenerateResult> {
  const enriched: PrintTemplate = {
    ...template,
    elements: await Promise.all(
      template.elements.map(async (element: any) => {
        if (element?.type !== 'image' || element.gfa) return element;
        const src = resolveImageSrc ? resolveImageSrc(element) : element.src;
        if (!src) return element;
        try {
          const { gfa } = await imageToGfa(src, { width_mm: element.width || 20, dpi: options.dpi });
          return { ...element, gfa };
        } catch {
          return element;
        }
      })
    ),
  };

  return generateZpl(enriched, options);
}
