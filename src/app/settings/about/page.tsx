'use client';

import { useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { useDeviceProfile } from '@/hooks/useDeviceProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AppInfoState {
  name: string;
  version: string;
  platform: string;
  userDataPath?: string;
}

interface MigrationRow {
  id: string;
  applied_at: string;
}

export default function AboutSettingsPage() {
  const bridge = useBridge();
  const profile = useDeviceProfile();
  const [info, setInfo] = useState<AppInfoState | null>(null);
  const [migrations, setMigrations] = useState<MigrationRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [appInfo, migrationRows] = await Promise.all([
        bridge.appInfo(),
        bridge.db.query<MigrationRow>('SELECT id, applied_at FROM _migrations ORDER BY id'),
      ]);
      if (!cancelled) {
        setInfo(appInfo);
        setMigrations(migrationRows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const rows: Array<[string, string]> = [
    ['Application', info?.name ?? deviceConfig.appName],
    ['Version', info?.version ?? deviceConfig.version],
    ['Platform', info?.platform ?? bridge.platform],
    ['App id', deviceConfig.appId],
    ['Device type', profile ? `${profile.type} (${profile.tier})` : '—'],
    ['Screen', profile ? `${profile.width}×${profile.height}${profile.isTouch ? ' · touch' : ''}` : '—'],
    ['ERP base URL', deviceConfig.erp.baseUrl],
    ['Data location', info?.userDataPath ?? 'browser storage (IndexedDB)'],
  ];

  return (
    <div className="space-y-4" data-testid="about-settings">
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-mono text-xs">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Database migrations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {migrations.map((migration) => (
            <Badge key={migration.id} variant="outline" className="font-mono">
              {migration.id}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
