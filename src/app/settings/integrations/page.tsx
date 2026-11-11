'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { IntegrationService, PerEntitySyncEngine } from '@/integration/per-entity-engine';
import type { IntegrationEntityRow } from '@/integration/pos-sync';
import { getDeviceAuth, getToken, type DeviceAuth } from '@/auth/manager';
import { DatahubService, DatahubSyncWorker, type DatahubConfigRow } from '@/integration/datahub/sync-worker';
import { registerDatahubIntegrations } from '@/integration/datahub/integrations';
import { getIntegrationEntityDef } from '@/integration/entities';
import deviceConfig from '@/device.config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';

interface EntityFormState {
  id?: string;
  entity_type: string;
  name: string;
  sync_source: 'device' | 'datahub' | 'api_key';
  base_url: string;
  endpoint: string;
  api_key: string;
  sync_direction: 'pull' | 'push';
  schedule: string;
}

const EMPTY_FORM: EntityFormState = {
  entity_type: '',
  name: '',
  sync_source: 'device',
  base_url: '',
  endpoint: '',
  api_key: '',
  sync_direction: 'pull',
  schedule: '30s',
};

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

/** Render a cell value in the record viewer (compact, human-readable). */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function IntegrationsSettingsPage() {
  const bridge = useBridge();
  const [service, setService] = useState<IntegrationService | null>(null);
  const [engine, setEngine] = useState<PerEntitySyncEngine | null>(null);
  const [entities, setEntities] = useState<IntegrationEntityRow[]>([]);
  const [form, setForm] = useState<EntityFormState | null>(null);
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuth | null>(null);
  const [busy, setBusy] = useState(false);
  // Data Hub connection (moved from the removed Settings → Data Hub page).
  const [dhService, setDhService] = useState<DatahubService | null>(null);
  const [dhWorker, setDhWorker] = useState<DatahubSyncWorker | null>(null);
  const [dhConfig, setDhConfig] = useState<DatahubConfigRow | null>(null);
  const [dhEndpoint, setDhEndpoint] = useState('');
  const [dhDeviceToken, setDhDeviceToken] = useState('');
  const [dhEnrollmentKey, setDhEnrollmentKey] = useState('');
  const [dhPosId, setDhPosId] = useState('');
  const [dhEnabled, setDhEnabled] = useState(false);
  const [rejects, setRejects] = useState<RejectRow[]>([]);
  // Record viewer — shows the rows an integration has synced into its local table.
  const [recordEntity, setRecordEntity] = useState<IntegrationEntityRow | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  // Field-map editor state.
  const [fieldMapEntity, setFieldMapEntity] = useState<IntegrationEntityRow | null>(null);
  const [fieldMaps, setFieldMaps] = useState<Array<{ source_field: string; target_field: string; direction: 'both' | 'push' | 'pull' }>>([]);

  useEffect(() => {
    setService(new IntegrationService(bridge));
    setEngine(new PerEntitySyncEngine(bridge));
    setDhService(new DatahubService(bridge));
    setDhWorker(new DatahubSyncWorker(bridge));
    void getDeviceAuth(bridge).then(setDeviceAuth);
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    setEntities(await service.listEntities());

    if (dhService) {
      const cfg = await dhService.getConfig();
      setDhConfig(cfg);
      if (cfg) {
        setDhEndpoint(cfg.endpoint);
        setDhDeviceToken(cfg.device_token ?? '');
        setDhEnrollmentKey(cfg.enrollment_key ?? '');
        setDhEnabled(cfg.enabled === 1);
        setDhPosId((p) => p || cfg.device_id || '');
      }
    }
    const rejectRows = await bridge.db.query<RejectRow>(
      'SELECT * FROM datahub_rejects ORDER BY created_at DESC LIMIT 10'
    );
    setRejects(rejectRows);
  }, [service, dhService, bridge]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEntity(): Promise<void> {
    if (!form || !service) return;
    const source = form.sync_source;
    // configCode (endpoint) only for device; base_url only for api_key; datahub needs neither.
    const needsEndpoint = source === 'device' || source === 'api_key';
    const needsBaseUrl = source === 'api_key';
    if (!form.entity_type.trim() || (needsEndpoint && !form.endpoint.trim()) || (needsBaseUrl && !form.base_url.trim())) {
      toast.add({
        title:
          source === 'datahub'
            ? 'Entity type is required'
            : source === 'device'
              ? 'Entity type and config code are required'
              : 'Entity type, base URL and endpoint are required',
        type: 'error',
      });
      return;
    }
    setBusy(true);
    try {
      const input = {
        entity_type: form.entity_type.trim(),
        name: form.name.trim() || form.entity_type.trim(),
        sync_source: form.sync_source,
        base_url: needsBaseUrl ? form.base_url.trim() : '',
        endpoint: needsEndpoint ? form.endpoint.trim() : '',
        api_key: source === 'api_key' ? form.api_key.trim() || undefined : undefined,
        sync_direction: form.sync_direction,
        schedule: form.schedule,
      };
      if (form.id) {
        await service.updateEntity(form.id, input);
        toast.add({ title: 'Integration updated', type: 'success' });
      } else {
        await service.createEntity(input);
        toast.add({ title: 'Integration added', type: 'success' });
      }
      // Data Hub rows feed the hub registry — refresh it so a flip applies now.
      if (form.sync_source === 'datahub') await registerDatahubIntegrations(bridge);
      setForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function openFieldMaps(entity: IntegrationEntityRow): Promise<void> {
    if (!service) return;
    const maps = await service.listFieldMaps(entity.id);
    setFieldMaps(maps.map((m) => ({ source_field: m.source_field, target_field: m.target_field, direction: m.direction })));
    setFieldMapEntity(entity);
  }

  async function saveFieldMaps(): Promise<void> {
    if (!service || !fieldMapEntity) return;
    setBusy(true);
    try {
      // Replace-all: delete existing, insert the new set.
      const existing = await service.listFieldMaps(fieldMapEntity.id);
      for (const m of existing) await service.deleteFieldMap(m.id);
      for (const m of fieldMaps) {
        if (!m.source_field.trim() || !m.target_field.trim()) continue;
        await service.createFieldMap(fieldMapEntity.id, fieldMapEntity.entity_type, {
          source_field: m.source_field.trim(),
          target_field: m.target_field.trim(),
          direction: m.direction,
        });
      }
      toast.add({ title: 'Field maps saved', type: 'success' });
      setFieldMapEntity(null);
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(): Promise<void> {
    if (!engine) return;
    setBusy(true);
    try {
      // Force: a manual click syncs now instead of being skipped by the schedule
      // the background loop already satisfied seconds ago.
      const result = await engine.runNow({ force: true });
      if (result.synced === 0 && result.errors === 0) {
        toast.add({
          title: 'Nothing to sync',
          description: 'No enabled REST integrations. Data Hub rows sync from the Connections card above.',
          type: 'default',
        });
      } else {
        toast.add({
          title: `Synced ${result.synced} entity(ies), ${result.errors} error(s)`,
          type: result.errors > 0 ? 'error' : 'success',
        });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  // ---- Data Hub connection (ported from the removed Settings → Data Hub page) ----

  async function saveDatahub(): Promise<void> {
    if (!dhService) return;
    if (!dhEndpoint.trim()) {
      toast.add({ title: 'Endpoint is required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await dhService.saveConfig({
        endpoint: dhEndpoint.trim(),
        device_token: dhDeviceToken.trim() || undefined,
        enrollment_key: dhEnrollmentKey.trim() || undefined,
        enabled: dhEnabled,
      });
      toast.add({ title: 'Data Hub config saved', type: 'success' });
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function registerDatahub(): Promise<void> {
    if (!dhService) return;
    if (!dhEndpoint.trim() || !dhEnrollmentKey.trim() || !dhPosId.trim()) {
      toast.add({ title: 'Endpoint, POS ID, and enrollment key are required to register', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const result = await dhService.register({
        endpoint: dhEndpoint.trim(),
        enrollment_key: dhEnrollmentKey.trim(),
        pos_id: dhPosId.trim(),
        name: dhPosId.trim(),
      });
      if (result.token) {
        toast.add({ title: `Registered — device ${result.device.pos_id} is ${result.device.status}`, type: 'success' });
      } else {
        toast.add({ title: result.message || 'Registered — awaiting administrator approval', type: 'info' });
      }
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Registration failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function syncDatahubNow(): Promise<void> {
    if (!dhWorker || !dhConfig) return;
    setBusy(true);
    try {
      const result = await dhWorker.syncNow(dhConfig.endpoint, (await getToken(bridge, 'datahub')) ?? '');
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

  // ---- Record viewer (rows an integration synced into its local table) ----

  async function loadRecords(entity: IntegrationEntityRow): Promise<void> {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      // Table comes from the entity registry (not user input) — safe to interpolate.
      const { table } = getIntegrationEntityDef(entity.entity_type);
      const count = await bridge.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
      const rows = await bridge.db.query<Record<string, unknown>>(`SELECT * FROM ${table} LIMIT 100`);
      setRecords(rows);
      setRecordCount(count[0]?.c ?? 0);
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : String(err));
      setRecords([]);
      setRecordCount(0);
    } finally {
      setRecordsLoading(false);
    }
  }

  function openRecords(entity: IntegrationEntityRow): void {
    setRecordEntity(entity);
    setRecords([]);
    setRecordCount(0);
    setRecordsError(null);
    void loadRecords(entity);
  }

  const recordColumns = records.length > 0 ? Object.keys(records[0]) : [];

  return (
    <div className="space-y-4" data-testid="integrations-settings">
      {/* Connections — where integrations sync from (device auth + Data Hub). */}
      <Card data-testid="connections-card">
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>Where integrations sync from — WEHA device auth and the Data Hub</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Device auth */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">WEHA device auth</p>
              <p className="text-xs text-muted-foreground">
                Bearer device token + tenant against the backend external API
              </p>
            </div>
            <span
              className={`rounded-md px-2 py-1 text-xs ${deviceAuth ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}
              data-testid="conn-device-auth-status"
            >
              {deviceAuth
                ? `Activated${deviceAuth.tenantId ? ` · tenant ${deviceAuth.tenantId}` : ''}`
                : 'Not activated — see Settings → Sync'}
            </span>
          </div>

          {/* Data Hub connection (moved from the removed Settings → Data Hub page). */}
          {deviceConfig.modules.datahub && (
            <div className="space-y-4 rounded-md border p-3" data-testid="datahub-connection">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Data Hub</p>
                <div className="flex items-center gap-2">
                  {dhConfig && (
                    <Badge variant={dhConfig.enabled ? 'default' : 'outline'}>
                      {dhConfig.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                  )}
                  {dhConfig?.device_token ? (
                    <Badge variant="outline">registered</Badge>
                  ) : (
                    <Badge variant="secondary">not registered</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hub-endpoint">Hub endpoint</Label>
                <Input
                  id="hub-endpoint"
                  data-testid="hub-endpoint-input"
                  value={dhEndpoint}
                  onChange={(e) => setDhEndpoint(e.target.value)}
                  placeholder="https://hub.example.com"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hub-pos-id">POS ID</Label>
                  <Input
                    id="hub-pos-id"
                    data-testid="hub-pos-id-input"
                    value={dhPosId}
                    onChange={(e) => setDhPosId(e.target.value)}
                    placeholder="POS-01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-enrollment-key">Enrollment key</Label>
                  <Input
                    id="hub-enrollment-key"
                    data-testid="hub-enrollment-input"
                    value={dhEnrollmentKey}
                    onChange={(e) => setDhEnrollmentKey(e.target.value)}
                    placeholder="sek_…"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hub-token">Device token</Label>
                <Input
                  id="hub-token"
                  type="password"
                  value={dhDeviceToken}
                  onChange={(e) => setDhDeviceToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Filled automatically after registration; paste to configure manually.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={dhEnabled} onChange={(e) => setDhEnabled(e.target.checked)} />
                Enabled
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void saveDatahub()} data-testid="save-datahub">
                  Save
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void registerDatahub()} data-testid="register-datahub">
                  Register device
                </Button>
                <Button variant="outline" disabled={busy || !dhConfig} onClick={() => void syncDatahubNow()} data-testid="datahub-sync-now">
                  <RefreshCw className="size-4 mr-2" />
                  Sync now
                </Button>
              </div>
            </div>
          )}

          {/* Rejected pushes (hub-reported failures) */}
          {rejects.length > 0 && (
            <div className="space-y-2" data-testid="datahub-rejects">
              <p className="text-sm font-medium">Rejected pushes</p>
              <p className="text-xs text-muted-foreground">Hub-reported terminal failures of pushed events (last 10).</p>
              <ul className="space-y-2 text-sm">
                {rejects.map((reject) => (
                  <li key={reject.id} className="rounded-md border p-2" data-testid="datahub-reject">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {reject.entity_type}
                        {reject.entity_id ? ` · ${reject.entity_id}` : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">{reject.failed_at ?? reject.created_at}</span>
                    </div>
                    {reject.error && <p className="mt-1 text-xs text-destructive">{reject.error}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Per-entity REST sync against external endpoints (register entities via registerIntegrationEntity)</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void syncNow()} disabled={busy} data-testid="sync-now">
              <RefreshCw className="size-4 mr-2" />
              Sync now
            </Button>
            <Button onClick={() => setForm({ ...EMPTY_FORM })} data-testid="add-integration">
              <Plus className="size-4 mr-2" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {entities.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No integrations configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Sync via</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.map((entity) => (
                  <TableRow key={entity.id} data-testid={`integration-row-${entity.entity_type}`}>
                    <TableCell className="font-medium">
                      {entity.name}
                      <Badge className="ml-2" variant={entity.enabled ? 'default' : 'outline'}>
                        {entity.enabled ? 'on' : 'off'}
                      </Badge>
                    </TableCell>
                    <TableCell className="uppercase">{entity.sync_direction}</TableCell>
                    <TableCell>
                      <Badge variant={entity.sync_source === 'api_key' ? 'outline' : 'default'}>
                        {entity.sync_source === 'device'
                          ? 'device'
                          : entity.sync_source === 'datahub'
                            ? 'data hub'
                            : 'api key'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-40 truncate font-mono text-xs">{entity.endpoint}</TableCell>
                    <TableCell className="font-mono text-xs">{entity.schedule}</TableCell>
                    <TableCell>
                      {entity.last_status ? (
                        <Badge variant={entity.last_status === 'success' ? 'default' : 'destructive'}>
                          {entity.last_status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForm({
                              id: entity.id,
                              entity_type: entity.entity_type,
                              name: entity.name,
                              sync_source: entity.sync_source ?? 'api_key',
                              base_url: entity.base_url,
                              endpoint: entity.endpoint,
                              api_key: entity.api_key ?? '',
                              sync_direction: entity.sync_direction,
                              schedule: entity.schedule,
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void openFieldMaps(entity)} data-testid={`fields-${entity.entity_type}`}>
                          Fields
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openRecords(entity)}
                          data-testid={`records-${entity.entity_type}`}
                        >
                          Records
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          onClick={async () => {
                            await service?.deleteEntity(entity.id);
                            await load();
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-md" data-testid="integration-form-dialog">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit integration' : 'Add integration'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="entity-type">Entity type</Label>
                <Input
                  id="entity-type"
                  data-testid="entity-type-input"
                  value={form.entity_type}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
                  placeholder="products"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="integration-name">Name</Label>
                <Input id="integration-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Products" />
              </div>
              <div className="space-y-2">
                <Label>Sync via</Label>
                <Select
                  value={form.sync_source}
                  onValueChange={(v) => setForm({ ...form, sync_source: v as 'device' | 'datahub' | 'api_key' })}
                >
                  <SelectTrigger data-testid="sync-source-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device">WEHA device (device auth)</SelectItem>
                    <SelectItem value="datahub">Data Hub</SelectItem>
                    <SelectItem value="api_key">API endpoint (key)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.sync_source === 'device' ? (
                <>
                  <div
                    className={`rounded-md px-3 py-2 text-xs ${deviceAuth ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}
                    data-testid="device-auth-status"
                  >
                    {deviceAuth
                      ? `Device activated${deviceAuth.tenantId ? ` · tenant ${deviceAuth.tenantId}` : ''}`
                      : 'Device not activated — activate it in Settings → Sync first.'}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endpoint">Config code</Label>
                    <Input
                      id="endpoint"
                      data-testid="config-code-input"
                      value={form.endpoint}
                      onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                      placeholder="PRODUCT"
                    />
                    <p className="text-xs text-muted-foreground">Backend entity code — called as /api/device/&lt;code&gt;.</p>
                  </div>
                </>
              ) : form.sync_source === 'datahub' ? (
                <div
                  className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
                  data-testid="datahub-hint"
                >
                  Syncs through the Data Hub connection above — the hub pushes and pulls this table as
                  events. No endpoint or key needed.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="base-url">Base URL</Label>
                    <Input id="base-url" data-testid="base-url-input" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endpoint">Endpoint</Label>
                    <Input id="endpoint" data-testid="endpoint-input" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="/v1/products" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-key">API key (optional)</Label>
                    <Input id="api-key" type="password" data-testid="api-key-input" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
                  </div>
                </>
              )}
              {form.sync_source !== 'datahub' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Direction</Label>
                    <Select value={form.sync_direction} onValueChange={(v) => setForm({ ...form, sync_direction: v as 'pull' | 'push' })}>
                      <SelectTrigger data-testid="direction-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pull">Pull</SelectItem>
                        <SelectItem value="push">Push</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schedule">Schedule</Label>
                    <Input id="schedule" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="30s" />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveEntity()} data-testid="save-integration">
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fieldMapEntity} onOpenChange={(open) => !open && setFieldMapEntity(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Field maps — {fieldMapEntity?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {fieldMaps.length === 0 && <p className="text-sm text-muted-foreground">No field maps yet. Add one below.</p>}
            {fieldMaps.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="source_field"
                  value={m.source_field}
                  onChange={(e) => setFieldMaps(fieldMaps.map((x, j) => (j === i ? { ...x, source_field: e.target.value } : x)))}
                />
                <span className="text-muted-foreground">→</span>
                <Input
                  placeholder="target_field"
                  value={m.target_field}
                  onChange={(e) => setFieldMaps(fieldMaps.map((x, j) => (j === i ? { ...x, target_field: e.target.value } : x)))}
                />
                <Select value={m.direction} onValueChange={(v) => setFieldMaps(fieldMaps.map((x, j) => (j === i ? { ...x, direction: v as 'both' | 'push' | 'pull' } : x)))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="pull">Pull</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setFieldMaps(fieldMaps.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFieldMaps([...fieldMaps, { source_field: '', target_field: '', direction: 'both' }])}
              data-testid="add-field-map"
            >
              <Plus className="size-3 mr-1" />
              Add field map
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldMapEntity(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveFieldMaps()} data-testid="save-field-maps">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record viewer — the rows this integration has synced into its table. */}
      <Dialog open={!!recordEntity} onOpenChange={(open) => !open && setRecordEntity(null)}>
        <DialogContent className="sm:max-w-3xl" data-testid="records-dialog">
          <DialogHeader>
            <DialogTitle>{recordEntity?.name} — records</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground" data-testid="records-count">
              {recordsLoading
                ? 'Loading…'
                : recordsError
                  ? ''
                  : `Showing ${records.length} of ${recordCount} row${recordCount === 1 ? '' : 's'}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={recordsLoading}
              onClick={() => recordEntity && loadRecords(recordEntity)}
              data-testid="records-refresh"
            >
              <RefreshCw className="mr-1 size-3.5" />
              Refresh
            </Button>
          </div>

          {recordsError ? (
            <p className="text-sm text-destructive" data-testid="records-error">
              {recordsError}
            </p>
          ) : recordsLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : records.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="records-empty">
              No records yet — run a sync to pull data in.
            </p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-md border" data-testid="records-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    {recordColumns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((row, i) => (
                    <TableRow key={String(row.id ?? i)}>
                      {recordColumns.map((col) => (
                        <TableCell key={col} className="whitespace-nowrap text-xs">
                          {formatCell(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
