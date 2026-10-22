import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_DIR = join(process.cwd(), 'public');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'manifest.json'), 'utf8')) as Manifest;

describe('PWA manifest', () => {
  it('has the ESS identity and standalone display', () => {
    expect(manifest.name).toBe('WEHA Employee Self-Service');
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('references icon files that actually exist', () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(existsSync(join(PUBLIC_DIR, icon.src.replace(/^\//, '')))).toBe(true);
    }
  });

  it('ships the service worker', () => {
    expect(existsSync(join(PUBLIC_DIR, 'sw.js'))).toBe(true);
  });
});
