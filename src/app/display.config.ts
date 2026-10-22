// Display-route registry — a device app registers the routes it can show on an
// external display (or a new tab on web). The framework ships this empty; the
// navbar renders a fullscreen toggle per registered route via <DisplayToggles />.
// Domain routes (customer-display, kiosk, …) belong to the device app, not here.

import type { LucideIcon } from 'lucide-react';

export interface DisplayRoute {
  /** Stable id used to track/open/close the display window. */
  id: string;
  /** Route path to load in the display window (e.g. '/customer-display'). */
  href: string;
  /** Human label shown in the toggle tooltip / expanded state. */
  label: string;
  /** Navbar icon. */
  icon: LucideIcon;
}

/** Registered display routes. A device app appends its own (or uses the helper). */
export const DISPLAY_ROUTES: DisplayRoute[] = [];

/** Register a display route (idempotent by id). Returns the route. */
export function registerDisplayRoute(route: DisplayRoute): DisplayRoute {
  const existing = DISPLAY_ROUTES.findIndex((r) => r.id === route.id);
  if (existing >= 0) DISPLAY_ROUTES[existing] = route;
  else DISPLAY_ROUTES.push(route);
  return route;
}

/** Remove a registered display route by id (mainly for tests). */
export function unregisterDisplayRoute(id: string): void {
  const idx = DISPLAY_ROUTES.findIndex((r) => r.id === id);
  if (idx >= 0) DISPLAY_ROUTES.splice(idx, 1);
}

/** Clear all registered display routes (mainly for tests). */
export function clearDisplayRoutes(): void {
  DISPLAY_ROUTES.length = 0;
}
