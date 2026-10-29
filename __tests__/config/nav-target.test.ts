// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutDashboard } from 'lucide-react';

async function loadNav(target: string | undefined) {
  vi.resetModules();
  if (target === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv('NEXT_PUBLIC_APP_TARGET', target);
  }
  return await import('@/app/nav.config');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('nav.config build-target gating', () => {
  it('shows all framework nav items on electron', async () => {
    const { navItemsForTarget } = await loadNav('electron');
    expect(navItemsForTarget().map((i) => i.href)).toEqual([
      '/dashboard',
      '/transactions',
      '/scan-locate',
      '/attendance',
      '/sync',
      '/settings',
    ]);
  });

  it('still shows sync on the minimal profile (sync module stays on)', async () => {
    const { navItemsForTarget } = await loadNav('web');
    expect(navItemsForTarget().map((i) => i.href)).toContain('/sync');
  });

  it('hides nav items whose module is disabled', async () => {
    const { navItemsForTarget } = await loadNav('web');
    const items = navItemsForTarget([
      { label: 'X', href: '/x', icon: LayoutDashboard, module: 'testing' },
      { label: 'Y', href: '/y', icon: LayoutDashboard, module: 'sync' },
    ]);
    expect(items.map((i) => i.href)).toEqual(['/y']);
  });

  it('exposes routeModule for the shell gate', async () => {
    const { routeModule } = await loadNav('web');
    expect(routeModule('/sync')).toBe('sync');
    expect(routeModule('/dashboard')).toBeUndefined();
    expect(routeModule('/sync/queue')).toBe('sync');
  });
});
