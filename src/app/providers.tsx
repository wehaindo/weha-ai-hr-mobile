'use client';

import { useEffect, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { BridgeProvider } from '@/platform';
import { Toaster } from '@/components/ui/toast';
import { useAuthBootstrap } from '@/auth/bootstrap';
import { useSyncWorker } from '@/sync/useSyncWorker';
import { initThemePreset } from '@/ui/themes';

function AppRuntime({ children }: { children: ReactNode }) {
  useAuthBootstrap();
  useSyncWorker();
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
