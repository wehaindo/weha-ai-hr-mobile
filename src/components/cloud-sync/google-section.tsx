'use client';

// Google Sheets section — OAuth account connect + sheet configs. Extracted from
// the standalone settings page so it can compose into the single Cloud Sync tab.

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import {
  GoogleConfigService,
  type GoogleAccountRow,
  type GoogleSheetConfigRow,
} from '@/integration/cloud/google/config';
import { GoogleClient, buildAuthUrl } from '@/integration/cloud/google/client';
import { getGoogleSyncWorker } from '@/integration/cloud/google/worker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { Plug, RefreshCw, Trash2 } from 'lucide-react';

interface ConnectForm {
  client_id: string;
  client_secret: string;
}

const EMPTY_CONNECT: ConnectForm = { client_id: '', client_secret: '' };

interface ConfigForm {
  id?: string;
  name: string;
  spreadsheet_id: string;
  worksheet_name: string;
  sync_mode: 'realtime' | 'scheduled' | 'manual';
  sync_interval_minutes: number;
}

const EMPTY_CONFIG: ConfigForm = { name: 'Order Lines', spreadsheet_id: '', worksheet_name: 'Order Lines', sync_mode: 'manual', sync_interval_minutes: 5 };

export function GoogleSection() {
  const bridge = useBridge();
  const [service, setService] = useState<GoogleConfigService | null>(null);
  const [account, setAccount] = useState<GoogleAccountRow | null>(null);
  const [configs, setConfigs] = useState<GoogleSheetConfigRow[]>([]);
  const [connectForm, setConnectForm] = useState<ConnectForm | null>(null);
  const [configForm, setConfigForm] = useState<ConfigForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setService(new GoogleConfigService(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    const accounts = await service.listAccounts();
    setAccount(accounts[0] ?? null);
    setConfigs(await service.listConfigs());
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect(): Promise<void> {
    if (!service || !connectForm) return;
    if (!connectForm.client_id.trim() || !connectForm.client_secret.trim()) {
      toast.add({ title: 'Client ID and secret are required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const redirectUri = 'http://localhost:9090/callback';
      const authorizeUrl = buildAuthUrl(connectForm.client_id.trim(), redirectUri);
      // cloud.googleOAuth opens a window + captures the code (Electron-only).
      const token = await bridge.cloud.googleOAuth(authorizeUrl, { port: 9090 });

      const client = new GoogleClient(bridge, { access_token: token.access_token });
      const info = await client.getUserInfo().catch(() => ({ email: undefined, sub: undefined }));

      const expiry = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined;
      await service.saveAccount({
        email: info.email,
        google_user_id: info.sub,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expiry: expiry,
        client_id: connectForm.client_id.trim(),
        client_secret: connectForm.client_secret.trim(),
      });
      toast.add({ title: 'Google account connected', type: 'success' });
      setConnectForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Connect failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(): Promise<void> {
    if (!service || !configForm) return;
    if (!configForm.name.trim()) {
      toast.add({ title: 'Name is required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const input = {
        name: configForm.name.trim(),
        spreadsheet_id: configForm.spreadsheet_id.trim() || undefined,
        worksheet_name: configForm.worksheet_name.trim() || 'Order Lines',
        sync_mode: configForm.sync_mode,
        sync_interval_minutes: configForm.sync_interval_minutes,
      };
      if (configForm.id) {
        await service.updateConfig(configForm.id, input);
        toast.add({ title: 'Config updated', type: 'success' });
      } else {
        await service.createConfig({ ...input, google_account_id: account?.id });
        toast.add({ title: 'Config added', type: 'success' });
      }
      setConfigForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(): Promise<void> {
    if (!service) return;
    setBusy(true);
    try {
      const client = await service.createClient(bridge, account?.id);
      const info = await client.getUserInfo();
      toast.add({ title: `Connected as ${info.email ?? 'unknown'}`, type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Test failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(): Promise<void> {
    setBusy(true);
    try {
      const worker = getGoogleSyncWorker(bridge);
      worker.start();
      await new Promise((r) => setTimeout(r, 300));
      worker.stop();
      toast.add({ title: 'Google sync cycle ran', type: 'success' });
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Sync failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="google-settings">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Google Account</CardTitle>
            <CardDescription>OAuth connection used to append order lines to Google Sheets</CardDescription>
          </div>
          <div className="flex gap-2">
            {account ? (
              <>
                <Button variant="outline" onClick={() => void testConnection()} disabled={busy} data-testid="google-test">
                  <Plug className="size-4 mr-2" />
                  Test
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                  onClick={async () => {
                    await service?.deleteAccount(account.id);
                    await load();
                  }}
                >
                  <Trash2 className="size-4 mr-2" />
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={() => setConnectForm({ ...EMPTY_CONNECT })} data-testid="google-connect">
                Connect
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {account ? (
            <div className="flex items-center gap-2">
              <Badge>connected</Badge>
              <span className="text-sm text-muted-foreground">{account.email ?? 'Google account'}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No Google account connected.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sheet Configs</CardTitle>
            <CardDescription>Spreadsheet + worksheet targets and sync mode</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void syncNow()} disabled={busy || !account}>
              <RefreshCw className="size-4 mr-2" />
              Sync now
            </Button>
            <Button onClick={() => setConfigForm({ ...EMPTY_CONFIG })} disabled={!account} data-testid="google-add-config">
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No sheet configs yet.</p>
          ) : (
            <div className="space-y-2">
              {configs.map((cfg) => (
                <div key={cfg.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`google-config-${cfg.id}`}>
                  <div>
                    <p className="text-sm font-medium">{cfg.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cfg.spreadsheet_name ?? cfg.spreadsheet_id ?? 'no spreadsheet'} · {cfg.worksheet_name} · {cfg.sync_mode}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setConfigForm({
                          id: cfg.id,
                          name: cfg.name,
                          spreadsheet_id: cfg.spreadsheet_id ?? '',
                          worksheet_name: cfg.worksheet_name,
                          sync_mode: cfg.sync_mode,
                          sync_interval_minutes: cfg.sync_interval_minutes,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        await service?.deleteConfig(cfg.id);
                        await load();
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!connectForm} onOpenChange={(open) => !open && setConnectForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect Google</DialogTitle>
          </DialogHeader>
          {connectForm && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="g-client-id">Client ID</Label>
                <Input id="g-client-id" value={connectForm.client_id} onChange={(e) => setConnectForm({ ...connectForm, client_id: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-client-secret">Client secret</Label>
                <Input id="g-client-secret" type="password" value={connectForm.client_secret} onChange={(e) => setConnectForm({ ...connectForm, client_secret: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void connect()} data-testid="google-connect-confirm">
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!configForm} onOpenChange={(open) => !open && setConfigForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{configForm?.id ? 'Edit config' : 'Add config'}</DialogTitle>
          </DialogHeader>
          {configForm && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="g-name">Name</Label>
                <Input id="g-name" value={configForm.name} onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-spreadsheet">Spreadsheet ID</Label>
                <Input id="g-spreadsheet" value={configForm.spreadsheet_id} onChange={(e) => setConfigForm({ ...configForm, spreadsheet_id: e.target.value })} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-worksheet">Worksheet</Label>
                <Input id="g-worksheet" value={configForm.worksheet_name} onChange={(e) => setConfigForm({ ...configForm, worksheet_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Sync mode</Label>
                  <Select value={configForm.sync_mode} onValueChange={(v) => setConfigForm({ ...configForm, sync_mode: v as ConfigForm['sync_mode'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="realtime">Realtime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="g-interval">Interval (min)</Label>
                  <Input id="g-interval" type="number" value={configForm.sync_interval_minutes} onChange={(e) => setConfigForm({ ...configForm, sync_interval_minutes: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveConfig()} data-testid="google-save-config">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
