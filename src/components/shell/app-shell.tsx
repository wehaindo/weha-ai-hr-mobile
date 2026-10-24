'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { findNavItem, isFullscreenRoute, isPublicRoute, routeModule, routePermission } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import deviceConfig from '@/device.config';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import AppSidebar from './app-sidebar';
import DesktopHeader from './desktop-header';
import TouchKeyboard from './touch-keyboard-gate';
import BottomNav from './bottom-nav';
import ProfileSheet from './profile-sheet';
import { useBottomNav } from '@/hooks/use-bottom-nav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const can = useAuthStore((s) => s.can);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomNav = useBottomNav();
  const [profileOpen, setProfileOpen] = useState(false);

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
          <div className="px-4 pt-4">
            <h1 className="truncate text-lg font-semibold" data-testid="page-title">
              {navItem?.label ?? ''}
            </h1>
          </div>
          <div className="p-4">{children}</div>
        </div>
        <BottomNav onOpenProfile={() => setProfileOpen(true)} />
        <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
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
