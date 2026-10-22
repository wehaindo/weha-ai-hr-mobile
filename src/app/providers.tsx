'use client';

import { useEffect, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { BridgeProvider } from '@/platform';
import { Toaster } from '@/components/ui/toast';
import { useAuthBootstrap } from '@/auth/bootstrap';
import { useSyncWorker } from '@/sync/useSyncWorker';
import { useCloudSyncWorkers } from '@/sync/useCloudSyncWorkers';
import { useAiRealtime } from '@/integration/ai-realtime';
import { useSettingsBoot } from '@/lib/settings-boot';
import { useTestingBoot } from '@/testing/use-testing-boot';
import { initThemePreset } from '@/ui/themes';

function AppRuntime({ children }: { children: ReactNode }) {
  useAuthBootstrap();
  useSyncWorker();
  useCloudSyncWorkers();
  useAiRealtime();
  useSettingsBoot();
  useTestingBoot();
  return <>{children}</>;
}

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initThemePreset();
  }, []);

  return (
    <BridgeProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <AppRuntime>{children}</AppRuntime>
        <Toaster />
      </ThemeProvider>
    </BridgeProvider>
  );
}
