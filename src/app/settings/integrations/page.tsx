'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { IntegrationService, PerEntitySyncEngine } from '@/integration/per-entity-engine';
import type { IntegrationEntityRow } from '@/integration/pos-sync';
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
  base_url: string;
  endpoint: string;
  api_key: string;
  sync_direction: 'pull' | 'push';
  schedule: string;
}

const EMPTY_FORM: EntityFormState = {
  entity_type: '',
  name: '',
  base_url: '',
  endpoint: '',
  api_key: '',
  sync_direction: 'pull',
  schedule: '30s',
};

export default function IntegrationsSettingsPage() {
  const bridge = useBridge();
  const [service, setService] = useState<IntegrationService | null>(null);
  const [engine, setEngine] = useState<PerEntitySyncEngine | null>(null);
  const [entities, setEntities] = useState<IntegrationEntityRow[]>([]);
  const [form, setForm] = useState<EntityFormState | null>(null);
  const [busy, setBusy] = useState(false);
  // Field-map editor state.
  const [fieldMapEntity, setFieldMapEntity] = useState<IntegrationEntityRow | null>(null);
  const [fieldMaps, setFieldMaps] = useState<Array<{ source_field: string; target_field: string; direction: 'both' | 'push' | 'pull' }>>([]);

  useEffect(() => {
    setService(new IntegrationService(bridge));
    setEngine(new PerEntitySyncEngine(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    setEntities(await service.listEntities());
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEntity(): Promise<void> {
    if (!form || !service) return;
    if (!form.entity_type.trim() || !form.base_url.trim() || !form.endpoint.trim()) {
      toast.add({ title: 'Entity type, base URL and endpoint are required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const input = {
        entity_type: form.entity_type.trim(),
        name: form.name.trim() || form.entity_type.trim(),
        base_url: form.base_url.trim(),
        endpoint: form.endpoint.trim(),
        api_key: form.api_key.trim() || undefined,
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
      const result = await engine.runNow();
      if (result.synced === 0 && result.errors === 0) {
        toast.add({ title: 'No enabled entities due for a run', type: 'default' });
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

  return (
    <div className="space-y-4" data-testid="integrations-settings">
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
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="w-28" />
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
                <Label htmlFor="base-url">Base URL</Label>
                <Input id="base-url" data-testid="base-url-input" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endpoint">Endpoint</Label>
                <Input id="endpoint" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="/v1/products" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key">API key (optional)</Label>
                <Input id="api-key" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
              </div>
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
    </div>
  );
}
