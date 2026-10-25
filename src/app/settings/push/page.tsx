'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge, type PushPermission } from '@/platform';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useSettingsGroup } from '@/components/settings/use-settings';
import { getStatus, startPush, stopPush, type PushStatus } from '@/integration/push';
import deviceConfig from '@/device.config';
import { Bell, BellOff } from 'lucide-react';

const PERMISSION_COLORS: Record<string, string> = {
  granted: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  default: 'bg-muted text-muted-foreground',
  unsupported: 'bg-muted text-muted-foreground',
};

export default function PushSettingsPage() {
  const bridge = useBridge();
  const { values, set } = useSettingsGroup('push', { enabled: false });
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await getStatus(bridge));
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function persistEnabled(enabled: boolean): Promise<void> {
    set('enabled', enabled);
    setBusy(true);
    try {
      await bridge.kv.set('push.enabled', enabled);
      if (enabled) {
        const next = await startPush(bridge);
        setStatus(next);
        if (next.supported && next.token) {
          toast.add({ title: 'Push enabled — device registered for FCM', type: 'success' });
        } else if (!next.supported) {
          toast.add({ title: 'Push enabled — not supported on this platform (local notifications only)', type: 'info' });
        } else {
          toast.add({ title: 'Push enabled — permission not granted or no token yet', type: 'info' });
        }
      } else {
        stopPush();
        await refresh();
        toast.add({ title: 'Push disabled', type: 'success' });
      }
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Failed to update push', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const permission: PushPermission | undefined = status?.permission;
  const permissionLabel = permission ?? '…';

  return (
    <div className="space-y-4" data-testid="push-settings">
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications (FCM)</CardTitle>
          <CardDescription>
            Firebase Cloud Messaging — receive notifications when the app is closed. The device FCM
            token is registered with the backend so a sender can target it. See docs/FCM.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={PERMISSION_COLORS[permissionLabel] ?? 'bg-muted text-muted-foreground'}>
              permission: {permissionLabel}
            </Badge>
            <Badge className={status?.supported ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}>
              {status?.supported ? 'FCM supported' : 'FCM unavailable'}
            </Badge>
            <Badge variant="outline">platform: {bridge.platform}</Badge>
            {status?.lastRegister && (
              <Badge
                className={
                  status.lastRegister.registered
                    ? 'bg-green-100 text-green-800'
                    : status.lastRegister.attempted
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-muted text-muted-foreground'
                }
              >
                {status.lastRegister.registered
                  ? 'registered'
                  : status.lastRegister.attempted
                    ? `register failed${status.lastRegister.message ? `: ${status.lastRegister.message}` : ''}`
                    : 'not registered'}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              {values.enabled ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">Enable push</p>
                <p className="text-xs text-muted-foreground">
                  Ask for permission, get an FCM token and register it with the backend.
                </p>
              </div>
            </div>
            <Switch
              checked={values.enabled}
              disabled={busy}
              onCheckedChange={(checked) => void persistEnabled(checked)}
              data-testid="push-enabled-toggle"
            />
          </div>

          {status?.token && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">FCM token</p>
              <p className="break-all rounded bg-muted p-2 font-mono text-xs" data-testid="push-token">
                {status.token}
              </p>
              {status.registeredAt && (
                <p className="text-xs text-muted-foreground">Registered: {status.registeredAt}</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void refresh()} data-testid="push-refresh">
              Refresh
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await bridge.push.unregister();
                    await bridge.kv.remove('push.fcmToken');
                    await bridge.kv.remove('push.registeredAt');
                    await refresh();
                    toast.add({ title: 'FCM token cleared on this device', type: 'success' });
                  } catch (err) {
                    toast.add({ title: err instanceof Error ? err.message : 'Unregister failed', type: 'error' });
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              data-testid="push-unregister"
            >
              Clear token
            </Button>
          </div>

          {bridge.platform === 'electron' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Electron cannot acquire an FCM token (no Push API, insecure app:// origin when packaged).
              Push falls back to local notifications; use web/PWA or Capacitor for real FCM delivery.
            </p>
          )}

          {!deviceConfig.firebase.apiKey && bridge.platform === 'web' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Firebase web config is not set. Add NEXT_PUBLIC_FIREBASE_* env vars and rebuild — see
              docs/FCM.md.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
