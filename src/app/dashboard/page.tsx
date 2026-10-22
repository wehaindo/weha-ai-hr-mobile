'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/sync/sync-store';
import { useDeviceProfile } from '@/hooks/useDeviceProfile';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useEssProfile } from '@/hooks/useEssProfile';
import { listEssWidgets } from '@/lib/ess/widgets/registry';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AppInfoState {
  name: string;
  version: string;
  platform: string;
  userDataPath?: string;
}

export default function DashboardPage() {
  const bridge = useBridge();
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];
  const sync = useSyncStore();
  const profile = useDeviceProfile();
  const { isOnline } = useOnlineStatus();
  const { state: essProfile } = useEssProfile();
  const [info, setInfo] = useState<AppInfoState | null>(null);
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [appInfo, users] = await Promise.all([
        bridge.appInfo(),
        bridge.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM users WHERE is_active = 1'),
      ]);
      if (!cancelled) {
        setInfo(appInfo);
        setUserCount(users[0]?.c ?? 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const widgets = listEssWidgets(permissions);
  const employeeName =
    essProfile.status === 'ready'
      ? essProfile.employee.name?.trim() ||
        [essProfile.employee.firstName, essProfile.employee.lastName].filter(Boolean).join(' ').trim() ||
        user?.display_name
      : user?.display_name;

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="dashboard">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome back, {employeeName ?? 'there'}</h2>
        <p className="text-sm text-muted-foreground">
          {essProfile.status === 'ready'
            ? [essProfile.employee.position, essProfile.employee.employeeNumber]
                .filter(Boolean)
                .join(' · ') || deviceConfig.appName
            : `${deviceConfig.appName} employee dashboard`}
        </p>
      </div>

      {widgets.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {widgets.map((widget) => {
            const Widget = widget.component;
            return <Widget key={widget.id} profile={essProfile} title={widget.title} />;
          })}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Device
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Application</CardDescription>
              <CardTitle className="text-lg">{info?.name ?? deviceConfig.appName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p>Version {info?.version ?? deviceConfig.version}</p>
              <p className="flex items-center gap-2">
                Platform: <Badge variant="outline">{info?.platform ?? bridge.platform}</Badge>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Device</CardDescription>
              <CardTitle className="text-lg capitalize">{profile?.type ?? '…'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p>
                Network: {isOnline ? <Badge>online</Badge> : <Badge variant="destructive">offline</Badge>}
              </p>
              <p>
                Screen: {profile ? `${profile.width}×${profile.height}` : '…'}
                {profile?.isTouch ? ' · touch' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sync</CardDescription>
              <CardTitle className="text-lg">
                {sync.activated ? (sync.stats.pending > 0 ? `${sync.stats.pending} queued` : 'Up to date') : 'Not activated'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p>{userCount} active user{userCount === 1 ? '' : 's'}</p>
              <Link href="/sync">
                <Button variant="link" className="h-auto p-0 text-xs">
                  Open sync monitor →
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {info?.userDataPath && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data location</CardDescription>
          </CardHeader>
          <CardContent className="font-mono text-xs text-muted-foreground">{info.userDataPath}</CardContent>
        </Card>
      )}
    </div>
  );
}
