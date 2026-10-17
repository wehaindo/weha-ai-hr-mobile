// Minimal ESC/POS command builder — enough for test pages and simple receipts.
// Device apps can extend this or bring their own renderer.

const LF = 0x0a;

export class EscPosBuilder {
  private bytes: number[] = [];

  static text(text: string, widthMm = 80): EscPosBuilder {
    const builder = new EscPosBuilder();
    builder.init().align('center').line(text).feed(2).align('left');
    void widthMm;
    return builder;
  }

  init(): this {
    this.bytes.push(0x1b, 0x40); // ESC @
    return this;
  }

  align(mode: 'left' | 'center' | 'right'): this {
    const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    this.bytes.push(0x1b, 0x61, n);
    return this;
  }

  bold(enabled: boolean): this {
    this.bytes.push(0x1b, 0x45, enabled ? 1 : 0);
    return this;
  }

  text(line: string): this {
    for (const byte of Buffer.from(line, 'utf8')) {
      this.bytes.push(byte);
    }
    this.bytes.push(LF);
    return this;
  }

  line(line: string): this {
    return this.text(line);
  }

  feed(lines = 1): this {
    for (let i = 0; i < lines; i++) this.bytes.push(LF);
    return this;
  }

  cut(): this {
    this.bytes.push(0x1d, 0x56, 0x42, 0x00); // GS V B 0
    return this;
  }

  raw(chunk: number[] | Uint8Array): this {
    this.bytes.push(...chunk);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export function buildTestPage(printerName: string, paperWidthMm = 80): Uint8Array {
  const now = new Date().toLocaleString();
  return new EscPosBuilder()
    .init()
    .align('center')
    .bold(true)
    .text('PRINTER TEST PAGE')
    .bold(false)
    .text(printerName)
    .feed()
    .text(`Paper: ${paperWidthMm}mm`)
    .text(now)
    .feed(2)
    .align('left')
    .text('If you can read this, the printer')
    .text('connection is working correctly.')
    .feed(3)
    .cut()
    .build();
}
