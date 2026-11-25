'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { getSyncEngine } from '@/sync/useSyncWorker';
import { useSyncStore } from '@/sync/sync-store';
import { clearCompleted } from '@/sync/outbox';
import { getDeviceServerUrl, setDeviceServerUrl } from '@/lib/device-server-url';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';

interface SyncLogRow {
  id: number;
  entity_type: string | null;
  direction: string | null;
  status: string;
  message: string | null;
  created_at: string;
}

export default function SyncPage() {
  const bridge = useBridge();
  const state = useSyncStore();
  const [activationToken, setActivationToken] = useState('');
  const [provisionTenant, setProvisionTenant] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<SyncLogRow[]>([]);

  const loadLog = useCallback(async () => {
    const rows = await bridge.db.query<SyncLogRow>(
      'SELECT id, entity_type, direction, status, message, created_at FROM sync_log ORDER BY id DESC LIMIT 20'
    );
    setLog(rows);
  }, [bridge]);

  useEffect(() => {
    void loadLog();
  }, [loadLog, state.lastRunAt]);

  useEffect(() => {
    void getDeviceServerUrl(bridge).then(setServerUrl);
  }, [bridge]);

  async function saveServerUrl(): Promise<void> {
    await run('Save server URL', async () => {
      await setDeviceServerUrl(bridge, serverUrl);
      toast.add({ title: 'Server URL saved', type: 'success' });
    });
  }

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      toast.add({
        title: `${label} failed`,
        description: err instanceof Error ? err.message : String(err),
        type: 'error',
      });
    } finally {
      setBusy(null);
      await loadLog();
    }
  }

  const engine = getSyncEngine(bridge);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="sync-page">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Activation</CardDescription>
            <CardTitle className="text-lg">{state.activated ? 'Activated' : 'Not activated'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {state.deviceCode ? <p>Device: <code>{state.deviceCode}</code></p> : null}
            {state.tenantSlug ? <p>Tenant: <code>{state.tenantSlug}</code></p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ERP connection</CardDescription>
            <CardTitle className="text-lg">
              {state.erpReachable === null ? 'Unknown' : state.erpReachable ? 'Reachable' : 'Unreachable'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {state.lastError ? <p className="line-clamp-2">{state.lastError}</p> : <p>No recent errors</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Queue</CardDescription>
            <CardTitle className="text-lg">{state.stats.pending} pending</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>{state.stats.failed} failed · {state.stats.done} done</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last sync</CardDescription>
            <CardTitle className="text-lg">
              {state.lastRunAt ? new Date(state.lastRunAt).toLocaleTimeString() : 'Never'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>{state.running ? 'Running…' : 'Idle'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Device-auth server URL — editable here so device auth isn't tied to the env value. */}
      <Card data-testid="server-url-card">
        <CardHeader className="pb-2">
          <CardDescription>Server URL (device auth)</CardDescription>
          <CardTitle className="text-lg">Backend endpoint</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="server-url">Server URL</Label>
            <Input
              id="server-url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://framework.weha-id.com"
              data-testid="server-url-input"
            />
            <p className="text-xs text-muted-foreground">
              Where activation and <code>/api/device/…</code> calls are sent (device auth). Mobile auth keeps
              the env URL.
            </p>
          </div>
          <Button
            disabled={busy !== null || !serverUrl.trim()}
            onClick={() => void saveServerUrl()}
            data-testid="save-server-url"
          >
            {busy === 'Save server URL' ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      {!state.activated && (
        <Card>
          <CardHeader>
            <CardTitle>Activate device</CardTitle>
            <CardDescription>
              Paste an activation code, an activation link, or an existing <code>dev_live_…</code> device token.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="activation-token">Activation token</Label>
              <Input
                id="activation-token"
                value={activationToken}
                onChange={(e) => setActivationToken(e.target.value)}
                placeholder="activation code, link, or dev_live_ token…"
                data-testid="activation-token"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="provision-tenant">Tenant (bare device token only)</Label>
              <Input
                id="provision-tenant"
                value={provisionTenant}
                onChange={(e) => setProvisionTenant(e.target.value)}
                placeholder="tenant slug or id"
                data-testid="provision-tenant"
              />
            </div>
            <Button
              disabled={!activationToken || busy !== null}
              onClick={() =>
                void run('Activate', async () => {
                  const kind = await engine.activateFromInput(
                    activationToken.trim(),
                    provisionTenant.trim() || undefined
                  );
                  setActivationToken('');
                  toast.add({
                    title: kind === 'activated' ? 'Device activated' : 'Device provisioned',
                    type: 'success',
                  });
                  // End-to-end data-access check: read an entity from the backend.
                  const check = await engine.testConnection();
                  if (check.success) {
                    toast.add({ title: `Data access OK (${check.durationMs}ms)`, type: 'success' });
                  } else {
                    toast.add({ title: 'Data access failed', description: check.error, type: 'error' });
                  }
                })
              }
              data-testid="activate-button"
            >
              {busy === 'Activate' ? 'Activating…' : 'Activate'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy !== null || !state.activated}
            onClick={() =>
              void run('Test connection', async () => {
                const result = await engine.testConnection();
                if (!result.success) {
                  toast.add({ title: 'Connection failed', description: result.error, type: 'error' });
                } else {
                  toast.add({ title: `Connected in ${result.durationMs}ms`, type: 'success' });
                }
              })
            }
            data-testid="test-connection"
          >
            {busy === 'Test connection' ? 'Testing…' : 'Test connection'}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null || !state.activated}
            onClick={() => void run('Sync now', () => engine.runNow())}
            data-testid="sync-now"
          >
            {busy === 'Sync now' ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null || !state.activated}
            onClick={() => {
              if (
                !window.confirm(
                  "Clear this device's activation? You'll need a new activation token to activate again."
                )
              ) {
                return;
              }
              void run('Clear activation', async () => {
                await engine.clearActivation();
                toast.add({
                  title: 'Activation cleared',
                  description: 'Paste a new activation token in the card above to activate again.',
                  type: 'success',
                });
              });
            }}
            data-testid="clear-activation"
          >
            {busy === 'Clear activation' ? 'Clearing…' : 'Clear activation'}
          </Button>
          <Button
            variant="outline"
            disabled={state.stats.done === 0}
            onClick={() => void run('Clear completed', () => clearCompleted(bridge))}
          >
            Clear completed
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{row.direction ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.entity_type ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'success' ? 'default' : 'destructive'}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs">{row.message ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
