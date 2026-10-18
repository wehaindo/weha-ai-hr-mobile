'use client';

// Grist section — doc/table config + table_mode. Extracted from the standalone
// settings page so it can compose into the Cloud Sync tab.

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { GristConfigService, type GristConfigRow } from '@/integration/cloud/grist/config';
import { getGristSyncWorker } from '@/integration/cloud/grist/worker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { Plug, RefreshCw, Trash2 } from 'lucide-react';

interface ConfigForm {
  id?: string;
  name: string;
  grist_url: string;
  api_token: string;
  doc_id: string;
  table_id: string;
  table_mode: 'single' | 'daily' | 'monthly';
  sync_mode: 'realtime' | 'scheduled' | 'manual';
}

const EMPTY_FORM: ConfigForm = {
  name: 'Grist',
  grist_url: 'https://docs.getgrist.com',
  api_token: '',
  doc_id: '',
  table_id: 'OrderLines',
  table_mode: 'single',
  sync_mode: 'manual',
};

export function GristSection() {
  const bridge = useBridge();
  const [service, setService] = useState<GristConfigService | null>(null);
  const [config, setConfig] = useState<GristConfigRow | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setService(new GristConfigService(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    setConfig(await service.getConfig());
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!service || !form) return;
    if (!form.grist_url.trim() || !form.api_token.trim() || !form.doc_id.trim()) {
      toast.add({ title: 'URL, token and doc ID are required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await service.saveConfig({
        name: form.name.trim() || 'Grist',
        grist_url: form.grist_url.trim(),
        api_token: form.api_token.trim(),
        doc_id: form.doc_id.trim(),
        table_id: form.table_id.trim() || 'OrderLines',
        table_mode: form.table_mode,
        sync_mode: form.sync_mode,
      });
      toast.add({ title: 'Grist config saved', type: 'success' });
      setForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(): Promise<void> {
    setBusy(true);
    try {
      const worker = getGristSyncWorker(bridge);
      worker.start();
      await new Promise((r) => setTimeout(r, 300));
      worker.stop();
      toast.add({ title: 'Grist sync cycle ran', type: 'success' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function openForm(): void {
    if (config) {
      setForm({
        id: config.id,
        name: config.name,
        grist_url: config.grist_url,
        api_token: config.api_token ?? '',
        doc_id: config.doc_id ?? '',
        table_id: config.table_id,
        table_mode: config.table_mode,
        sync_mode: config.sync_mode,
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }

  return (
    <div className="space-y-4" data-testid="grist-settings">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Grist</CardTitle>
            <CardDescription>Push order lines to a Grist doc table (auto-creates the table)</CardDescription>
          </div>
          <div className="flex gap-2">
            {config ? (
              <>
                <Button variant="outline" onClick={() => void syncNow()} disabled={busy}>
                  <RefreshCw className="size-4 mr-2" />
                  Sync now
                </Button>
                <Button variant="outline" onClick={openForm} data-testid="grist-edit">
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                  onClick={async () => {
                    await service?.deleteConfig(config.id);
                    await load();
                  }}
                >
                  <Trash2 className="size-4 mr-2" />
                </Button>
              </>
            ) : (
              <Button onClick={openForm} data-testid="grist-add">
                <Plug className="size-4 mr-2" />
                Connect
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {config ? (
            <div className="flex items-center gap-2">
              <Badge>{config.sync_mode}</Badge>
              <span className="text-sm text-muted-foreground">
                {config.grist_url} · doc {config.doc_id} · table {config.table_id} ({config.table_mode})
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No Grist connection configured.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit Grist' : 'Connect Grist'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gr-name">Name</Label>
                <Input id="gr-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gr-url">Grist URL</Label>
                <Input id="gr-url" data-testid="grist-url-input" value={form.grist_url} onChange={(e) => setForm({ ...form, grist_url: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gr-token">API token</Label>
                <Input id="gr-token" type="password" value={form.api_token} onChange={(e) => setForm({ ...form, api_token: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="gr-doc">Doc ID</Label>
                  <Input id="gr-doc" value={form.doc_id} onChange={(e) => setForm({ ...form, doc_id: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gr-table">Table ID</Label>
                  <Input id="gr-table" value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Table mode</Label>
                  <Select value={form.table_mode} onValueChange={(v) => setForm({ ...form, table_mode: v as ConfigForm['table_mode'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single table</SelectItem>
                      <SelectItem value="daily">Daily tables</SelectItem>
                      <SelectItem value="monthly">Monthly tables</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sync mode</Label>
                  <Select value={form.sync_mode} onValueChange={(v) => setForm({ ...form, sync_mode: v as ConfigForm['sync_mode'] })}>
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
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()} data-testid="grist-save">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
