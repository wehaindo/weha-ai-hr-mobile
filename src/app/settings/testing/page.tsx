'use client';

// Testing module home: lists the four test models with live row counts, Seed /
// Clear fixture actions, and a "Run test sync" that pushes the test products
// through the cloud orderline enqueue pipeline (offline queuing) to exercise the
// integration surface end-to-end.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useBridge } from '@/platform';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FlaskConical, DatabaseZap, Eraser, RefreshCw } from 'lucide-react';
import { listTestModels } from '@/testing/registry';
import { seedTestingModels, clearTestingModels, getTestingCounts } from '@/testing/seed';
import { enqueueAllDestinations } from '@/integration/cloud/enqueue';

export default function TestingSettingsPage() {
  const bridge = useBridge();
  const models = listTestModels();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setCounts(await getTestingCounts(bridge));
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function seed(): Promise<void> {
    setBusy(true);
    try {
      await seedTestingModels(bridge);
      await refresh();
      toast.add({ title: 'Test fixtures seeded', type: 'success' });
    } catch (err) {
      toast.add({ title: 'Seed failed', description: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function clear(): Promise<void> {
    setBusy(true);
    try {
      await clearTestingModels(bridge);
      await refresh();
      toast.add({ title: 'Test fixtures cleared', type: 'success' });
    } catch (err) {
      toast.add({ title: 'Clear failed', description: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function runTestSync(): Promise<void> {
    setBusy(true);
    try {
      const results = await enqueueAllDestinations(bridge, { sourceType: 'test_products', limit: 200 });
      const parts = results.map((r) => `${r.destination}: ${r.error ?? `${r.enqueued} queued${r.skipped ? ` (${r.skipped} dup)` : ''}`}`);
      toast.add({ title: 'Test sync queued', description: parts.join(' · '), type: 'success' });
    } catch (err) {
      toast.add({ title: 'Test sync failed', description: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Testing</h1>
          <p className="text-muted-foreground">
            Seeded fixture models for exercising the integration surface (sync, Data Hub, cloud).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void runTestSync()} disabled={busy} data-testid="run-test-sync">
            <RefreshCw className="size-4 mr-1" />
            Run test sync
          </Button>
          <Button variant="outline" onClick={() => void seed()} disabled={busy} data-testid="seed-testing">
            <DatabaseZap className="size-4 mr-1" />
            Seed
          </Button>
          <Button variant="outline" onClick={() => void clear()} disabled={busy} data-testid="clear-testing">
            <Eraser className="size-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {models.map((m) => (
          <Card key={m.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="size-4" />
                  {m.label}
                </CardTitle>
                <CardDescription>{m.description}</CardDescription>
              </div>
              <Badge>{counts[m.id] ?? 0} rows</Badge>
            </CardHeader>
            <CardContent>
              <Link href={`/settings/testing/${m.id}`} className="text-sm underline underline-offset-4" data-testid={`open-${m.id}`}>
                Open {m.label.toLowerCase()} →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
