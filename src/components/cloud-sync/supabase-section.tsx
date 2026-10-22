'use client';

// Supabase section — PostgREST config + SETUP_SQL + license toggle. Extracted
// from the standalone settings page so it can compose into the Cloud Sync tab.

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { SupabaseConfigService, type SupabaseConfigRow } from '@/integration/cloud/supabase/config';
import { testConnection } from '@/integration/cloud/supabase/client';
import { getSupabaseSyncWorker } from '@/integration/cloud/supabase/worker';
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
  supabase_url: string;
  access_token: string;
  sync_mode: 'realtime' | 'scheduled' | 'manual';
  sync_interval_minutes: number;
  batch_size: number;
  max_retries: number;
  tenant_id: string;
  store_id: string;
  branch_id: string;
  terminal_id: string;
}

const EMPTY_FORM: ConfigForm = {
  name: 'Supabase',
  supabase_url: '',
  access_token: '',
  sync_mode: 'manual',
  sync_interval_minutes: 5,
  batch_size: 100,
  max_retries: 5,
  tenant_id: '',
  store_id: '',
  branch_id: '',
  terminal_id: '',
};

// Setup SQL a device operator runs once in the Supabase SQL editor (ai-pos parity).
const SETUP_SQL = `-- Run once in the Supabase SQL editor
create table if not exists public.pos_orderlines (
  id text primary key,
  tenant_id text, store_id text, branch_id text, terminal_id text,
  order_id text, order_number text, order_line_id text,
  product_name text, quantity numeric, unit_price numeric,
  subtotal numeric, total numeric,
  created_at timestamptz default now()
);`;

export function SupabaseSection() {
  const bridge = useBridge();
  const [service, setService] = useState<SupabaseConfigService | null>(null);
  const [config, setConfig] = useState<SupabaseConfigRow | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setService(new SupabaseConfigService(bridge));
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
    if (!form.supabase_url.trim() || !form.access_token.trim()) {
      toast.add({ title: 'URL and token are required', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await service.saveConfig({
        name: form.name.trim() || 'Supabase',
        supabase_url: form.supabase_url.trim(),
        access_token: form.access_token.trim(),
        sync_mode: form.sync_mode,
        sync_interval_minutes: form.sync_interval_minutes,
        batch_size: form.batch_size,
        max_retries: form.max_retries,
        tenant_id: form.tenant_id.trim() || undefined,
        store_id: form.store_id.trim() || undefined,
        branch_id: form.branch_id.trim() || undefined,
        terminal_id: form.terminal_id.trim() || undefined,
      });
      toast.add({ title: 'Supabase config saved', type: 'success' });
      setForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function test(): Promise<void> {
    if (!config) return;
    setBusy(true);
    try {
      const result = await testConnection(bridge, { supabase_url: config.supabase_url, access_token: config.access_token });
      toast.add({ title: result.ok ? 'Connection OK' : (result.error ?? 'Test failed'), type: result.ok ? 'success' : 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(): Promise<void> {
    setBusy(true);
    try {
      const worker = getSupabaseSyncWorker(bridge);
      worker.start();
      await new Promise((r) => setTimeout(r, 300));
      worker.stop();
      toast.add({ title: 'Supabase sync cycle ran', type: 'success' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(enabled: boolean): Promise<void> {
    if (!service || !config) return;
    await service.setEnabled(enabled);
    await load();
  }

  function openForm(): void {
    if (config) {
      setForm({
        id: config.id,
        name: config.name,
        supabase_url: config.supabase_url,
        access_token: config.access_token ?? '',
        sync_mode: config.sync_mode,
        sync_interval_minutes: config.sync_interval_minutes,
        batch_size: config.batch_size,
        max_retries: config.max_retries,
        tenant_id: config.tenant_id ?? '',
        store_id: config.store_id ?? '',
        branch_id: config.branch_id ?? '',
        terminal_id: config.terminal_id ?? '',
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }

  return (
    <div className="space-y-4" data-testid="supabase-settings">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Supabase</CardTitle>
            <CardDescription>Push order lines to a Supabase table via PostgREST (idempotent upsert)</CardDescription>
          </div>
          <div className="flex gap-2">
            {config ? (
              <>
                <Button variant="outline" onClick={() => void test()} disabled={busy}>
                  <Plug className="size-4 mr-2" />
                  Test
                </Button>
                <Button variant="outline" onClick={() => void syncNow()} disabled={busy}>
                  <RefreshCw className="size-4 mr-2" />
                  Sync now
                </Button>
                <Button variant="outline" onClick={openForm} data-testid="supabase-edit">
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
              <Button onClick={openForm} data-testid="supabase-add">
                Connect
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {config ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant={config.is_active ? 'default' : 'outline'}>{config.is_active ? 'enabled' : 'disabled'}</Badge>
                <span className="text-sm text-muted-foreground">{config.supabase_url}</span>
                <label className="ml-auto flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={config.is_active === 1} onChange={(e) => void toggleEnabled(e.target.checked)} />
                  Enabled
                </label>
              </div>
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">Setup SQL (run once)</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{SETUP_SQL}</pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No Supabase connection configured.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit Supabase' : 'Connect Supabase'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sb-name">Name</Label>
                <Input id="sb-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sb-url">Project URL</Label>
                <Input id="sb-url" data-testid="supabase-url-input" value={form.supabase_url} onChange={(e) => setForm({ ...form, supabase_url: e.target.value })} placeholder="https://xyz.supabase.co" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sb-token">Publishable / anon key</Label>
                <Input id="sb-token" type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-2">
                  <Label htmlFor="sb-batch">Batch size</Label>
                  <Input id="sb-batch" type="number" value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sb-tenant">Tenant ID</Label>
                  <Input id="sb-tenant" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sb-store">Store ID</Label>
                  <Input id="sb-store" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sb-branch">Branch ID</Label>
                  <Input id="sb-branch" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sb-terminal">Terminal ID</Label>
                  <Input id="sb-terminal" value={form.terminal_id} onChange={(e) => setForm({ ...form, terminal_id: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()} data-testid="supabase-save">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
