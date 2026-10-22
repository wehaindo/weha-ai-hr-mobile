'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { DatahubService, DatahubSyncWorker, type DatahubConfigRow } from '@/integration/datahub/sync-worker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { RefreshCw } from 'lucide-react';

export default function DatahubSettingsPage() {
  const bridge = useBridge();
  const [service, setService] = useState<DatahubService | null>(null);
  const [worker, setWorker] = useState<DatahubSyncWorker | null>(null);
  const [config, setConfig] = useState<DatahubConfigRow | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setService(new DatahubService(bridge));
    setWorker(new DatahubSyncWorker(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    const cfg = await service.getConfig();
    setConfig(cfg);
    if (cfg) {
      setEndpoint(cfg.endpoint);
      setDeviceToken(cfg.device_token ?? '');
      setEnabled(cfg.enabled === 1);
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!service) return;
    if (!endpoint.trim()) {
      toast.add({ title: 'Endpoint is required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await service.saveConfig({ endpoint: endpoint.trim(), device_token: deviceToken.trim() || undefined, enabled });
      toast.add({ title: 'Data Hub config saved', type: 'success' });
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(): Promise<void> {
    if (!worker || !config) return;
    setBusy(true);
    try {
      const result = await worker.syncNow(config.endpoint, config.device_token ?? '');
      toast.add({
        title: `Pulled ${result.pulled}, applied ${result.applied}, pushed ${result.pushed}, ${result.errors.length} error(s)`,
        type: result.errors.length > 0 ? 'error' : 'success',
      });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Sync failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="datahub-settings">
      <Card>
        <CardHeader>
          <CardTitle>Data Hub</CardTitle>
          <CardDescription>Cursor + ack event replication against a hub server (register entities via registerHubEntity)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config && (
            <div className="flex items-center gap-2">
              <Badge variant={config.enabled ? 'default' : 'outline'}>{config.enabled ? 'enabled' : 'disabled'}</Badge>
              {config.last_sync_at && (
                <span className="text-xs text-muted-foreground">Last sync: {new Date(config.last_sync_at).toLocaleString()}</span>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="hub-endpoint">Hub endpoint</Label>
            <Input id="hub-endpoint" data-testid="hub-endpoint-input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://hub.example.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hub-token">Device token</Label>
            <Input id="hub-token" type="password" value={deviceToken} onChange={(e) => setDeviceToken(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>

          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void save()} data-testid="save-datahub">
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="outline" disabled={busy || !config} onClick={() => void syncNow()}>
              <RefreshCw className="size-4 mr-2" />
              Sync now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
