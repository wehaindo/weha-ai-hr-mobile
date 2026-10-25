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
  it('shows all nav items on electron (full profile, no module filtering)', async () => {
    const nav = await loadNav('electron');
    // Full target: every declared item survives — framework entries and this
    // app's ESS additions alike (apps extend NAV_ITEMS by design).
    expect(nav.navItemsForTarget().map((i) => i.href)).toEqual(nav.NAV_ITEMS.map((i) => i.href));
    expect(nav.navItemsForTarget().map((i) => i.href)).toContain('/leave');
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

  it('flags exactly the primary bottom-nav tabs as mobile', async () => {
    const { NAV_ITEMS } = await loadNav('web');
    const primary = NAV_ITEMS.filter((i) => i.mobile).map((i) => i.href);
    expect(primary).toEqual(['/dashboard', '/leave', '/requests']);
  });
});
