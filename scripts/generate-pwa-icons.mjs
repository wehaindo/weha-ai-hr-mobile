// Generates the PWA icon set (pure Node — no image dependencies).
// Usage: node scripts/generate-pwa-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'icons');

const BG = [245, 158, 11, 255]; // amber-500 (device.config brand.primary)
const FG = [28, 25, 23, 255]; // stone-900

const GLYPH = [
  // 5x7 bitmap for "W"
  '10001',
  '10001',
  '10001',
  '10101',
  '10101',
  '11011',
  '10001',
];

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size, glyphWidthCells = 5, marginCells = 2) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set(BG, i * 4);

  const cellsWide = glyphWidthCells + marginCells * 2;
  const cell = Math.floor(size / cellsWide);
  const glyphW = cell * glyphWidthCells;
  const glyphH = cell * GLYPH.length;
  const x0 = Math.floor((size - glyphW) / 2);
  const y0 = Math.floor((size - glyphH) / 2);

  for (let row = 0; row < GLYPH.length; row++) {
    for (let col = 0; col < glyphWidthCells; col++) {
      if (GLYPH[row][col] !== '1') continue;
      for (let y = y0 + row * cell; y < y0 + (row + 1) * cell; y++) {
        for (let x = x0 + col * cell; x < x0 + (col + 1) * cell; x++) {
          pixels.set(FG, (y * size + x) * 4);
        }
      }
    }
  }
  return encodePng(size, size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'icon-192.png'), makeIcon(192, 5, 2));
writeFileSync(join(OUT_DIR, 'icon-512.png'), makeIcon(512, 5, 2));
writeFileSync(join(OUT_DIR, 'icon-maskable-512.png'), makeIcon(512, 5, 4)); // safe zone: 60%
writeFileSync(join(OUT_DIR, 'apple-touch-icon.png'), makeIcon(180, 5, 2));
console.log('PWA icons written to public/icons/');
