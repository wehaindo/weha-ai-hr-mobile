'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { findNavItem, isFullscreenRoute, isPublicRoute, routePermission } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import deviceConfig from '@/device.config';
import AppSidebar from './app-sidebar';
import DesktopHeader from './desktop-header';
import TouchKeyboard from './touch-keyboard-gate';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const can = useAuthStore((s) => s.can);

  const isPublic = isPublicRoute(pathname);
  const permission = routePermission(pathname);

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

  const navItem = findNavItem(pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DesktopHeader title={navItem?.label} />
        <main className="flex-1 overflow-auto bg-muted/30 p-6" data-testid="main-content">
          {children}
        </main>
      </div>
      {deviceConfig.modules.onScreenKeyboard && <TouchKeyboard />}
    </div>
  );
}
