// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig(target: string | undefined) {
  vi.resetModules();
  if (target === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv('NEXT_PUBLIC_APP_TARGET', target);
  }
  const mod = await import('@/device.config');
  return mod.default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('device.config build target', () => {
  it('falls back to the minimal web profile when unset', async () => {
    const config = await loadConfig(undefined);
    expect(config.target).toBe('web');
    expect(config.modules.sync).toBe(true);
    expect(config.modules.print).toBe(false);
    expect(config.modules.hardware).toBe(false);
  });

  it('falls back to web for unknown values', async () => {
    const config = await loadConfig('desktop');
    expect(config.target).toBe('web');
    expect(config.modules.print).toBe(false);
  });

  it('gives electron the full profile', async () => {
    const config = await loadConfig('electron');
    expect(config.target).toBe('electron');
    expect(config.modules.print).toBe(true);
    expect(config.modules.hardware).toBe(true);
    expect(config.modules.testing).toBe(true);
    expect(config.modules.backup).toBe(true);
  });

  it('gives cap-tablet the full profile', async () => {
    const config = await loadConfig('cap-tablet');
    expect(config.target).toBe('cap-tablet');
    expect(config.modules.onScreenKeyboard).toBe(true);
    expect(config.modules.integration).toBe(true);
  });

  it('gives cap-mobile the minimal profile', async () => {
    const config = await loadConfig('cap-mobile');
    expect(config.target).toBe('cap-mobile');
    expect(config.modules.sync).toBe(true);
    expect(config.modules.datahub).toBe(true);
    expect(config.modules.security).toBe(true);
    expect(config.modules.print).toBe(false);
    expect(config.modules.cloud).toBe(false);
    expect(config.modules.testing).toBe(false);
  });

  it('minimal keeps every module key present (no undefined flags)', async () => {
    const minimal = await loadConfig('web');
    const full = await loadConfig('electron');
    for (const key of Object.keys(full.modules)) {
      expect(minimal.modules[key as keyof typeof minimal.modules]).toBeTypeOf('boolean');
    }
    expect(Object.keys(minimal.modules).sort()).toEqual(Object.keys(full.modules).sort());
  });
});
