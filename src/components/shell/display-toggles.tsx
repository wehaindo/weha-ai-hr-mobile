'use client';

// Display toggles — a reusable navbar group that opens each registered display
// route fullscreen (external display on Electron, new tab on web). Ported from
// ai-pos's display icons, genericized to read from the display registry. Hidden
// when no display routes are registered (framework default).

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { DISPLAY_ROUTES, type DisplayRoute } from '@/app/display.config';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DisplayToggles({ routes = DISPLAY_ROUTES }: { routes?: DisplayRoute[] }) {
  const bridge = useBridge();
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Sync open-state from the platform on mount (survives reloads on Electron).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const open = new Set<string>();
      for (const route of routes) {
        if (await bridge.display.isOpen(route.id)) open.add(route.id);
      }
      if (!cancelled) setOpenIds(open);
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, routes]);

  const toggle = useCallback(
    async (route: DisplayRoute) => {
      const isOpen = openIds.has(route.id);
      try {
        if (isOpen) {
          await bridge.display.close(route.id);
          setOpenIds((prev) => {
            const next = new Set(prev);
            next.delete(route.id);
            return next;
          });
        } else {
          await bridge.display.open(route.id, route.href);
          setOpenIds((prev) => new Set(prev).add(route.id));
        }
      } catch (err) {
        console.error(`Failed to toggle display ${route.id}:`, err);
      }
    },
    [bridge, openIds]
  );

  if (routes.length === 0) return null;

  return (
    <>
      {routes.map((route) => {
        const isOpen = openIds.has(route.id);
        const Icon = route.icon;
        return (
          <Button
            key={route.id}
            variant={isOpen ? 'default' : 'ghost'}
            size="sm"
            className="gap-1.5"
            title={isOpen ? `Close ${route.label}` : `Open ${route.label}`}
            data-testid={`display-toggle-${route.id}`}
            onClick={() => void toggle(route)}
          >
            <Icon className="size-4" />
            <span className={cn('hidden lg:inline text-sm')}>
              {isOpen ? `${route.label} ✓` : route.label}
            </span>
          </Button>
        );
      })}
    </>
  );
}
