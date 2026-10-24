'use client';

// Decides whether the shell renders the bottom navigator (web/PWA narrow +
// Capacitor mobile) or the sidebar (wide web, Electron, Capacitor tablet).
// Build target is fixed at build time; only the web target consults the viewport.

import deviceConfig from '@/device.config';
import { bottomNavForTarget } from '@/lib/app-target';
import { useIsMobile } from '@/hooks/use-mobile';

export function useBottomNav(): boolean {
  const isMobile = useIsMobile();
  return bottomNavForTarget(deviceConfig.target, isMobile);
}
