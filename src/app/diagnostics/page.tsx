'use client';

import { useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import {
  createEssDeviceAdapter,
  type EssCapability,
  type EssDeviceInfo,
} from '@/lib/platform/ess-device';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ALL_CAPABILITIES: EssCapability[] = [
  'notifications',
  'camera',
  'qr-scan',
  'rfid',
  'fingerprint',
  'location',
];

type InitState = 'pending' | 'ok' | 'failed';

export default function DiagnosticsPage() {
  const bridge = useBridge();
  const [init, setInit] = useState<InitState>('pending');
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<EssCapability[]>([]);
  const [info, setInfo] = useState<EssDeviceInfo | null>(null);

  useEffect(() => {
    const adapter = createEssDeviceAdapter(bridge);
    let cancelled = false;
    void (async () => {
      try {
        await adapter.initialize();
        if (cancelled) return;
        setInit('ok');
        const [caps, deviceInfo] = await Promise.all([
          adapter.getCapabilities(),
          adapter.getDeviceInfo(),
        ]);
        if (cancelled) return;
        setCapabilities(caps);
        setInfo(deviceInfo);
      } catch (err) {
        if (cancelled) return;
        setInit('failed');
        // Safe message only — detailed errors stay out of production UI.
        setError(
          process.env.NODE_ENV !== 'production' && err instanceof Error
            ? err.message
            : 'Adapter initialization failed.'
        );
      }
    })();
    return () => {
      cancelled = true;
      void adapter.dispose();
    };
  }, [bridge]);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="diagnostics-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Device Diagnostics</h2>
        <p className="text-sm text-muted-foreground">
          Runtime, adapter status and verified capabilities
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Runtime</CardDescription>
          <CardTitle className="text-lg capitalize">{bridge.platform}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Adapter initialization</span>
            {init === 'ok' && <Badge>OK</Badge>}
            {init === 'pending' && <Badge variant="secondary">Checking…</Badge>}
            {init === 'failed' && <Badge variant="destructive">Failed</Badge>}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Application</span>
            <span>
              {info?.appName ?? deviceConfig.appName} v{info?.appVersion ?? deviceConfig.version}
            </span>
          </div>
          {info?.deviceName && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Device name</span>
              <span>{info.deviceName}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Capabilities</CardDescription>
          <CardTitle className="text-lg">
            {capabilities.length} of {ALL_CAPABILITIES.length} available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_CAPABILITIES.map((cap) => {
              const available = capabilities.includes(cap);
              return (
                <div
                  key={cap}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="capitalize">{cap.replace('-', ' ')}</span>
                  {available ? (
                    <Badge>available</Badge>
                  ) : (
                    <Badge variant="secondary">not supported</Badge>
                  )}
                </div>
              );
            })}
          </div>
          <p className="pt-3 text-xs text-muted-foreground">
            Only capabilities verified at runtime are marked available. Camera, QR,
            RFID, fingerprint and location need Capacitor plugins (Phase 2/3).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Configuration</CardDescription>
          <CardTitle className="text-lg">Modules & endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Framework URL</span>
            <span className="font-mono text-xs">{deviceConfig.erp.baseUrl}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Object.entries(deviceConfig.modules)
              .filter(([, enabled]) => enabled)
              .map(([name]) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
