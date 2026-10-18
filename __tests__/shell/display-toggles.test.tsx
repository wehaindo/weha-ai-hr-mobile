// @vitest-environment node
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Monitor, Tablet } from 'lucide-react';
import DisplayToggles from '@/components/shell/display-toggles';
import { clearDisplayRoutes, registerDisplayRoute, DISPLAY_ROUTES } from '@/app/display.config';

// Mock the platform bridge (static render doesn't run effects, so only the
// shape matters here; open/close/isOpen wiring is covered by the bridge tests).
vi.mock('@/platform', () => ({
  useBridge: () => ({
    display: { open: async () => {}, close: async () => {}, isOpen: async () => false },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(routes?: any[]): string {
  return renderToStaticMarkup(routes ? <DisplayToggles routes={routes} /> : <DisplayToggles />);
}

describe('DisplayToggles (render)', () => {
  beforeEach(() => {
    clearDisplayRoutes();
  });

  it('renders nothing when no display routes are registered', () => {
    expect(render()).toBe('');
    expect(DISPLAY_ROUTES).toHaveLength(0);
  });

  it('renders a toggle per registered route', () => {
    registerDisplayRoute({ id: 'customer-display', href: '/customer-display', label: 'Customer Display', icon: Monitor });
    registerDisplayRoute({ id: 'kiosk', href: '/kiosk', label: 'Kiosk', icon: Tablet });

    const html = render();
    expect(html).toContain('display-toggle-customer-display');
    expect(html).toContain('display-toggle-kiosk');
    expect(html).toContain('Customer Display');
    expect(html).toContain('Kiosk');
  });

  it('accepts an explicit routes prop (device-app override)', () => {
    const html = render([{ id: 'demo', href: '/demo', label: 'Demo', icon: Monitor }]);
    expect(html).toContain('display-toggle-demo');
    expect(html).toContain('Demo');
  });
});
