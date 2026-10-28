'use client';

import { useEffect, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { BridgeProvider, useBridge } from '@/platform';
import { Toaster } from '@/components/ui/toast';
import { useAuthBootstrap } from '@/auth/bootstrap';
import { useSyncWorker } from '@/sync/useSyncWorker';
import { useCloudSyncWorkers } from '@/sync/useCloudSyncWorkers';
import { useAiRealtime } from '@/integration/ai-realtime';
import { usePush } from '@/integration/push';
import { useSettingsBoot } from '@/lib/settings-boot';
import { useTestingBoot } from '@/testing/use-testing-boot';
import { initThemePreset } from '@/ui/themes';

function AppRuntime({ children }: { children: ReactNode }) {
  useAuthBootstrap();
  useSyncWorker();
  useCloudSyncWorkers();
  useAiRealtime();
  usePush();
  useSettingsBoot();
  useTestingBoot();
  return <>{children}</>;
}

function ServiceWorkerRegistration() {
  const bridge = useBridge();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (bridge.platform !== 'web') return; // PWA is a browser concern
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* service worker is best-effort — the app works without it */
    });
  }, [bridge]);

  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initThemePreset();
  }, []);

  return (
    <BridgeProvider>
      <ServiceWorkerRegistration />
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <AppRuntime>{children}</AppRuntime>
        <Toaster />
      </ThemeProvider>
    </BridgeProvider>
  );
}
