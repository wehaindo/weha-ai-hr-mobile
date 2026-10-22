// Content-array → ESC/POS bytes compiler.
//
// ai-pos renders receipts as a `PrintContentItem[]` (JSON) and converts to bytes
// in the Electron main process. The framework compiles bytes in the renderer and
// ships raw bytes over the DeviceBridge, so this compiler lives here and is
// platform-free (Uint8Array + TextEncoder, no Node Buffer).

export interface PrintContentStyle {
  bold?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  /** 2 = double-width character size (GS !). */
  width?: number;
}

export type PrintContentItem =
  | { type: 'text'; value?: string; style?: PrintContentStyle }
  | { type: 'line'; width?: number }
  | { type: 'feed'; lines?: number }
  | { type: 'cut' };

const ESC = 0x1b;
const GS = 0x1d;

/** ESC/POS cash-drawer pulse: ESC p 0 25 255 (drawer 1). */
export const DRAWER_COMMAND = Uint8Array.from([ESC, 0x70, 0x00, 0x19, 0xff]);

const encoder = new TextEncoder();

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

/** Compile a content array into raw ESC/POS bytes ready for `bridge.print.raw`. */
export function buildEscPosBytes(content: PrintContentItem[]): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const item of content) {
    if (item.type === 'text') {
      const style = item.style ?? {};
      if (style.bold) chunks.push(bytes(ESC, 0x45, 0x01));
      if (style.underline) chunks.push(bytes(ESC, 0x2d, 0x01));
      if (style.align === 'center') chunks.push(bytes(ESC, 0x61, 0x01));
      else if (style.align === 'right') chunks.push(bytes(ESC, 0x61, 0x02));
      else chunks.push(bytes(ESC, 0x61, 0x00));

      if (style.width === 2) chunks.push(bytes(GS, 0x21, 0x10));
      else if (style.width) chunks.push(bytes(GS, 0x21, 0x00));

      chunks.push(encoder.encode(item.value ?? ''));
      chunks.push(bytes(0x0a));

      // Reset inline styles so they don't leak past this line.
      if (style.bold) chunks.push(bytes(ESC, 0x45, 0x00));
      if (style.underline) chunks.push(bytes(ESC, 0x2d, 0x00));
      if (style.width === 2) chunks.push(bytes(GS, 0x21, 0x00));
    } else if (item.type === 'line') {
      const width = item.width || 32;
      chunks.push(encoder.encode('-'.repeat(width) + '\n'));
    } else if (item.type === 'feed') {
      for (let i = 0; i < (item.lines || 1); i++) chunks.push(bytes(0x0a));
    } else if (item.type === 'cut') {
      chunks.push(bytes(GS, 0x56, 0x00)); // full cut
    }
  }

  return concat(chunks);
}
