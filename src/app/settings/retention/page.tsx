'use client';

// Data Retention settings — age-based pruning of the framework's own log
// tables. Config persists to KV (`retention.*`) and the engine reads the same
// keys (fixing ai-pos's UI↔engine bug). Preview shows counts before cleanup.

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsCard, SettingsToggle, SettingsNumberField, SaveButton } from '@/components/settings/fields';
import { RetentionService, RETENTION_TABLES, type RetentionConfig } from '@/lib/retention/service';
import { Eye, Play, Trash2 } from 'lucide-react';

export default function RetentionSettingsPage() {
  const bridge = useBridge();
  const [service, setService] = useState<RetentionService | null>(null);
  const [config, setConfig] = useState<RetentionConfig | null>(null);
  const [preview, setPreview] = useState<Array<{ table: string; count: number; days: number }> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setService(new RetentionService(bridge));
  }, [bridge]);

  const load = useCallback(async () => {
    if (!service) return;
    setConfig(await service.getConfig());
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(): Promise<void> {
    if (!service || !config) return;
    setBusy(true);
    try {
      await service.saveConfig(config);
      toast.add({ title: 'Retention settings saved', type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview(): Promise<void> {
    if (!service || !config) return;
    setBusy(true);
    try {
      setPreview(await service.purgePreview(config));
    } finally {
      setBusy(false);
    }
  }

  async function handleRun(): Promise<void> {
    if (!service || !config) return;
    setBusy(true);
    try {
      const result = await service.runCleanup(config);
      const total = result.reduce((sum, r) => sum + r.deleted, 0);
      toast.add({ title: `Cleanup complete — deleted ${total} rows`, type: 'success' });
      setPreview(null);
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Cleanup failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge(): Promise<void> {
    if (!service) return;
    setBusy(true);
    try {
      const result = await service.runPurge();
      const total = result.reduce((sum, r) => sum + r.deleted, 0);
      toast.add({ title: `Purged ${total} rows`, type: 'success' });
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  if (!config) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4" data-testid="retention-settings">
      <SettingsCard
        title="Automatic cleanup"
        description="Delete old rows from the framework's own log tables on a schedule"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void handlePreview()} disabled={busy} data-testid="retention-preview">
              <Eye className="size-3 mr-1" />
              Preview
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleRun()} disabled={busy} data-testid="retention-run">
              <Play className="size-3 mr-1" />
              Run now
            </Button>
          </div>
        }
      >
        <SettingsToggle
          label="Enable automatic cleanup"
          description="Prune aged log rows when the app runs"
          checked={config.enabled}
          onChange={(v) => setConfig({ ...config, enabled: v })}
          testId="retention-enabled"
        />
      </SettingsCard>

      <SettingsCard title="Retention (days)" description="Rows older than N days are deleted (0 = keep forever)">
        <div className="grid gap-4 sm:grid-cols-2">
          {RETENTION_TABLES.map((t) => (
            <SettingsNumberField
              key={t.table}
              label={t.table}
              value={config.days[t.table] ?? t.defaultDays}
              onChange={(v) => setConfig({ ...config, days: { ...config.days, [t.table]: v } })}
              min={0}
              testId={`retention-days-${t.table}`}
            />
          ))}
        </div>
      </SettingsCard>

      {preview && (
        <SettingsCard title="Preview" description="Rows that would be deleted">
          {preview.every((p) => p.count === 0) ? (
            <p className="text-sm text-muted-foreground">Nothing to clean up.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {preview
                .filter((p) => p.count > 0)
                .map((p) => (
                  <Badge key={p.table} variant="outline">
                    {p.table}: {p.count}
                  </Badge>
                ))}
            </div>
          )}
        </SettingsCard>
      )}

      <SettingsCard title="Purge now" description="Immediately delete ALL rows from log tables (regardless of age)">
        <Button variant="destructive" onClick={() => void handlePurge()} disabled={busy} data-testid="retention-purge">
          <Trash2 className="size-4 mr-2" />
          Purge all log data
        </Button>
      </SettingsCard>

      <div className="flex justify-end">
        <SaveButton onSave={() => void handleSave()} busy={busy} testId="save-retention" />
      </div>
    </div>
  );
}
