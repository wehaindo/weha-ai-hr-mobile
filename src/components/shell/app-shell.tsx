'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BellIcon, ShieldCheckIcon } from 'lucide-react';
import { findNavItem, isFullscreenRoute, isPublicRoute, routeModule, routePermission } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import { useNotifications, unreadNotificationCount } from '@/stores/notifications';
import deviceConfig from '@/device.config';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import AppSidebar from './app-sidebar';
import DesktopHeader from './desktop-header';
import TouchKeyboard from './touch-keyboard-gate';
import BottomNav from './bottom-nav';
import ProfileSheet from './profile-sheet';
import MoreSheet from './more-sheet';
import NotificationsSheet from './notifications-sheet';
import { useBottomNav } from '@/hooks/use-bottom-nav';
import { usePendingApprovals } from '@/hooks/use-pending-approvals';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const can = useAuthStore((s) => s.can);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomNav = useBottomNav();
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const pendingApprovals = usePendingApprovals();
  const notifications = useNotifications((s) => s.items);
  const unreadNotifications = unreadNotificationCount(notifications);

  // Restore collapsed state persisted by SidebarProvider (sidebar_state cookie).
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)sidebar_state=([^;]+)/);
    if (match) setSidebarOpen(match[1] === 'true');
  }, []);

  const isPublic = isPublicRoute(pathname);
  const permission = routePermission(pathname);
  const featureModule = routeModule(pathname);

  useEffect(() => {
    if (!isPublic && !isAuthenticated) {
      router.replace('/');
    }
  }, [isPublic, isAuthenticated, router]);

  // Login and other public routes: bare layout.
  if (isPublic) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return null;
  }

  // Fullscreen routes (kiosk / displays): no chrome.
  if (isFullscreenRoute(pathname)) {
    return <main className="h-screen overflow-hidden">{children}</main>;
  }

  // Permission gate for the whole route.
  if (permission && !can(permission)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border p-8 text-center">
          <p className="text-lg font-semibold">Access denied</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your role does not have the <code className="font-mono">{permission}</code> permission.
          </p>
        </div>
      </div>
    );
  }

  // Feature-module gate: route not shipped for this build target.
  if (featureModule && !deviceConfig.modules[featureModule]) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border p-8 text-center">
          <p className="text-lg font-semibold">Not available</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This feature is not included in the <code className="font-mono">{deviceConfig.target}</code> build.
          </p>
        </div>
      </div>
    );
  }

  const navItem = findNavItem(pathname);

  // Bottom navigator layout (web/PWA narrow + Capacitor mobile): no sidebar,
  // no header — controls live in the Profile tab's bottom sheet.
  if (bottomNav) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <div className="flex-1 overflow-auto bg-muted/30" data-testid="main-content">
          <div className="flex items-center justify-between gap-2 px-4 pt-4">
            <h1 className="truncate text-lg font-semibold" data-testid="page-title">
              {navItem?.label ?? ''}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {pendingApprovals > 0 && (
                <Link
                  href="/approvals"
                  data-testid="approvals-status"
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <ShieldCheckIcon className="size-3.5" aria-hidden />
                  {pendingApprovals > 9 ? '9+' : pendingApprovals}
                </Link>
              )}
              <button
                type="button"
                data-testid="notifications-button"
                onClick={() => setNotificationsOpen(true)}
                aria-label="Notifications"
                className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
              >
                <BellIcon className="size-5" />
                {unreadNotifications > 0 && (
                  <span
                    data-testid="notifications-badge"
                    className="absolute -top-0.5 -right-0.5 flex min-w-4 justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
                  >
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
            </div>
          </div>
          <div className="p-4">{children}</div>
        </div>
        <BottomNav onOpenProfile={() => setProfileOpen(true)} onOpenMore={() => setMoreOpen(true)} />
        <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
        <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
        <NotificationsSheet open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      </div>
    );
  }

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} className="h-screen overflow-hidden">
      <AppSidebar />
      <SidebarInset>
        <DesktopHeader title={navItem?.label} />
        <div className="flex-1 overflow-auto bg-muted/30 p-6" data-testid="main-content">
          {children}
        </div>
      </SidebarInset>
      {deviceConfig.modules.onScreenKeyboard && <TouchKeyboard />}
    </SidebarProvider>
  );
}
