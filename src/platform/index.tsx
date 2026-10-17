'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DeviceBridge } from './bridge';
import { createRendererBridge } from './renderer-bridge';

export type { DeviceBridge, DeviceBridgeEventMap, AppInfo, PlatformKind } from './bridge';

function isElectronBridge(value: unknown): value is DeviceBridge {
  return !!value && typeof value === 'object' && (value as DeviceBridge).platform === 'electron';
}

function isCapacitorNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export async function getBridge(): Promise<DeviceBridge> {
  if (isElectronBridge((window as unknown as { deviceBridge?: unknown }).deviceBridge)) {
    return (window as unknown as { deviceBridge: DeviceBridge }).deviceBridge;
  }
  return createRendererBridge(isCapacitorNative() ? 'capacitor' : 'web');
}

const BridgeContext = createContext<DeviceBridge | null>(null);

export function BridgeProvider({ children }: { children: ReactNode }) {
  const [bridge, setBridge] = useState<DeviceBridge | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBridge()
      .then((b) => {
        if (!cancelled) setBridge(b);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-sm text-destructive">
          <p className="font-semibold">Failed to initialize device platform</p>
          <p className="mt-2 font-mono text-xs">{error}</p>
        </div>
      </div>
    );
  }

  if (!bridge) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

export function useBridge(): DeviceBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error('useBridge must be used within <BridgeProvider>');
  return bridge;
}
