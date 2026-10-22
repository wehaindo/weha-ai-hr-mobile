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

interface RejectRow {
  id: string;
  device_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  execution_id: string | null;
  error: string | null;
  failed_at: string | null;
  created_at: string;
}

export default function DatahubSettingsPage() {
  const bridge = useBridge();
  const [service, setService] = useState<DatahubService | null>(null);
  const [worker, setWorker] = useState<DatahubSyncWorker | null>(null);
  const [config, setConfig] = useState<DatahubConfigRow | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [posId, setPosId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejects, setRejects] = useState<RejectRow[]>([]);

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
      setEnrollmentKey(cfg.enrollment_key ?? '');
      setEnabled(cfg.enabled === 1);
      if (!posId) setPosId(cfg.device_id ?? '');
    }
    const rejectRows = await bridge.db.query<RejectRow>(
      'SELECT * FROM datahub_rejects ORDER BY created_at DESC LIMIT 10'
    );
    setRejects(rejectRows);
  }, [service, bridge, posId]);

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
      await service.saveConfig({
        endpoint: endpoint.trim(),
        device_token: deviceToken.trim() || undefined,
        enrollment_key: enrollmentKey.trim() || undefined,
        enabled,
      });
      toast.add({ title: 'Data Hub config saved', type: 'success' });
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function register(): Promise<void> {
    if (!service) return;
    if (!endpoint.trim() || !enrollmentKey.trim() || !posId.trim()) {
      toast.add({ title: 'Endpoint, POS ID, and enrollment key are required to register', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const result = await service.register({
        endpoint: endpoint.trim(),
        enrollment_key: enrollmentKey.trim(),
        pos_id: posId.trim(),
        name: posId.trim(),
      });
      if (result.token) {
        toast.add({ title: `Registered — device ${result.device.pos_id} is ${result.device.status}`, type: 'success' });
      } else {
        toast.add({
          title: result.message || 'Registered — awaiting administrator approval',
          type: 'info',
        });
      }
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Registration failed', type: 'error' });
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
      await load();
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
              {config.device_token ? (
                <Badge variant="outline">registered</Badge>
              ) : (
                <Badge variant="secondary">not registered</Badge>
              )}
              {config.last_sync_at && (
                <span className="text-xs text-muted-foreground">Last sync: {new Date(config.last_sync_at).toLocaleString()}</span>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="hub-endpoint">Hub endpoint</Label>
            <Input id="hub-endpoint" data-testid="hub-endpoint-input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://hub.example.com" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hub-pos-id">POS ID</Label>
              <Input id="hub-pos-id" data-testid="hub-pos-id-input" value={posId} onChange={(e) => setPosId(e.target.value)} placeholder="POS-01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hub-enrollment-key">Enrollment key</Label>
              <Input id="hub-enrollment-key" data-testid="hub-enrollment-input" value={enrollmentKey} onChange={(e) => setEnrollmentKey(e.target.value)} placeholder="sek_…" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hub-token">Device token</Label>
            <Input id="hub-token" type="password" value={deviceToken} onChange={(e) => setDeviceToken(e.target.value)} />
            <p className="text-xs text-muted-foreground">Filled automatically after registration; paste to configure manually.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>

          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void save()} data-testid="save-datahub">
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void register()} data-testid="register-datahub">
              {busy ? 'Working…' : 'Register device'}
            </Button>
            <Button variant="outline" disabled={busy || !config} onClick={() => void syncNow()}>
              <RefreshCw className="size-4 mr-2" />
              Sync now
            </Button>
          </div>
        </CardContent>
      </Card>

      {rejects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rejected pushes</CardTitle>
            <CardDescription>Hub-reported terminal failures of pushed events (last 10).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {rejects.map((reject) => (
                <li key={reject.id} className="border rounded-md p-2" data-testid="datahub-reject">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{reject.entity_type}{reject.entity_id ? ` · ${reject.entity_id}` : ''}</span>
                    <span className="text-xs text-muted-foreground">{reject.failed_at ?? reject.created_at}</span>
                  </div>
                  {reject.error && <p className="mt-1 text-xs text-destructive">{reject.error}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
