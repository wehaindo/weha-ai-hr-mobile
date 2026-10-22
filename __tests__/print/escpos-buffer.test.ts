// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildEscPosBytes, DRAWER_COMMAND } from '@/lib/print/escpos-buffer';

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('buildEscPosBytes', () => {
  it('prefixes text with align-left (ESC a 0) and a trailing newline', () => {
    const bytes = buildEscPosBytes([{ type: 'text', value: 'Hello' }]);
    // ESC a 0 (align left) is emitted before every text run.
    expect(Array.from(bytes).slice(0, 3)).toEqual([0x1b, 0x61, 0x00]);
    expect(decode(bytes)).toContain('Hello');
    expect(decode(bytes)).toContain('\n');
  });

  it('emits alignment commands for center and right', () => {
    const center = buildEscPosBytes([{ type: 'text', value: 'x', style: { align: 'center' } }]);
    // ESC a 1
    expect(Array.from(center).slice(0, 3)).toEqual([0x1b, 0x61, 0x01]);

    const right = buildEscPosBytes([{ type: 'text', value: 'x', style: { align: 'right' } }]);
    // ESC a 2
    expect(Array.from(right).slice(0, 3)).toEqual([0x1b, 0x61, 0x02]);
  });

  it('wraps bold text with ESC E on and off', () => {
    const bytes = buildEscPosBytes([{ type: 'text', value: 'B', style: { bold: true } }]);
    const seq = Array.from(bytes);
    const onIndex = seq.findIndex((_, i) => seq[i] === 0x1b && seq[i + 1] === 0x45 && seq[i + 2] === 0x01);
    const offIndex = seq.findIndex((_, i) => seq[i] === 0x1b && seq[i + 1] === 0x45 && seq[i + 2] === 0x00);
    expect(onIndex).toBeGreaterThanOrEqual(0);
    expect(offIndex).toBeGreaterThan(onIndex);
  });

  it('renders a line item as repeated dashes', () => {
    const bytes = buildEscPosBytes([{ type: 'line', width: 10 }]);
    expect(decode(bytes)).toContain('----------');
  });

  it('renders feed as newlines', () => {
    const bytes = buildEscPosBytes([{ type: 'feed', lines: 3 }]);
    expect(bytes).toEqual(Uint8Array.from([0x0a, 0x0a, 0x0a]));
  });

  it('emits a full-cut command', () => {
    const bytes = buildEscPosBytes([{ type: 'cut' }]);
    expect(Array.from(bytes)).toEqual([0x1d, 0x56, 0x00]);
  });

  it('compiles a mixed content array in order', () => {
    const bytes = buildEscPosBytes([
      { type: 'text', value: 'A' },
      { type: 'feed', lines: 1 },
      { type: 'cut' },
    ]);
    const decoded = decode(bytes);
    expect(decoded).toContain('A');
    expect(decoded).toContain('\n');
    // GS V 0 at the tail
    expect(Array.from(bytes).slice(-3)).toEqual([0x1d, 0x56, 0x00]);
  });
});

describe('DRAWER_COMMAND', () => {
  it('is the ESC/POS cash-drawer pulse (ESC p 0 25 255)', () => {
    expect(Array.from(DRAWER_COMMAND)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xff]);
  });
});
