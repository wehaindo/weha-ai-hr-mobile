// Navigation + chrome configuration. A device app extends NAV_ITEMS with its own
// routes and permissions; the shell derives sidebar, header and layout from it.

import {
  LayoutDashboard,
  Receipt,
  RefreshCw,
  ScanLine,
  Settings,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import deviceConfig, { type ModuleKey } from '@/device.config';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see the item (and access the route) */
  permission?: string;
  /** Feature module (device.config.ts) that must be enabled for this build target */
  module?: ModuleKey;
  /** Fullscreen routes render without sidebar/header (kiosk, displays) */
  fullscreen?: boolean;
  /** Public routes skip authentication (login screen) */
  public?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions', icon: Receipt, permission: 'transactions.use' },
  { label: 'Scan', href: '/scan-locate', icon: ScanLine, permission: 'transactions.use' },
  { label: 'Attendance', href: '/attendance', icon: UserCheck, module: 'three' },
  { label: 'Sync', href: '/sync', icon: RefreshCw, permission: 'sync.manage', module: 'sync' },
  { label: 'Settings', href: '/settings', icon: Settings, permission: 'settings.manage' },
];

/** Items whose feature module is enabled for this build target. */
export function navItemsForTarget(items: NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => !item.module || deviceConfig.modules[item.module]);
}

/** Longest-prefix route match against NAV_ITEMS. */
export function findNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}

export function isPublicRoute(pathname: string): boolean {
  return pathname === '/' || !!findNavItem(pathname)?.public;
}

export function isFullscreenRoute(pathname: string): boolean {
  return !!findNavItem(pathname)?.fullscreen;
}

/** Route permission gate — returns undefined when allowed. */
export function routePermission(pathname: string): string | undefined {
  return findNavItem(pathname)?.permission;
}

/** Route feature-module gate — returns undefined when allowed. */
export function routeModule(pathname: string): ModuleKey | undefined {
  return findNavItem(pathname)?.module;
}
