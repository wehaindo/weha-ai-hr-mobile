'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import {
  RefreshCw,
  RotateCcw,
  X,
  Printer,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useBridge } from '@/platform';
import { processOfflineQueue } from '@/lib/print/offline/queue-processor';
import TestPrintDialog from './TestPrintDialog';

interface JobRow {
  id: number;
  profile_id: string | null;
  doc_type: string;
  status: string;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

type Filter = 'all' | 'pending' | 'done' | 'failed' | 'retry';

const STATUS_STYLES: Record<string, { className: string; icon: typeof Clock }> = {
  pending: { className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200', icon: Clock },
  retry: { className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200', icon: RotateCcw },
  done: { className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200', icon: CheckCircle2 },
  failed: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200', icon: AlertCircle },
};

export default function PrintQueuePanel() {
  const bridge = useBridge();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showTest, setShowTest] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await bridge.db.query<JobRow>('SELECT * FROM print_queue ORDER BY id DESC LIMIT 100');
      setJobs(data);
    } catch (error) {
      console.error('[PrintQueuePanel] Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleProcess() {
    setBusy(true);
    try {
      const result = await processOfflineQueue(bridge);
      if (result.processed === 0) {
        toast.add({ title: 'No pending jobs', type: 'default' });
      } else {
        toast.add({
          title: `Processed ${result.processed} job(s): ${result.printed} printed, ${result.failed} failed`,
          type: result.failed > 0 ? 'error' : 'success',
        });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry(id: number) {
    await bridge.db.execute("UPDATE print_queue SET status = 'pending', retry_count = 0, last_error = NULL WHERE id = ?", [id]);
    await handleProcess();
  }

  async function handleCancel(id: number) {
    await bridge.db.execute("UPDATE print_queue SET status = 'failed', last_error = 'Cancelled' WHERE id = ?", [id]);
    await load();
  }

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1;
    return acc;
  }, {});

  const filtered = filter === 'all' ? jobs : jobs.filter((j) => j.status === filter);
  const filters: Filter[] = ['all', 'pending', 'done', 'failed', 'retry'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Printer className="size-4" />
              Print Queue
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {jobs.length} job(s) · {counts.pending || 0} pending · {counts.failed || 0} failed
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTest(true)}>
              <Printer className="size-3 mr-1" />
              Test Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn('size-3 mr-1', busy && 'animate-spin')} />
              Refresh
            </Button>
            <Button size="sm" onClick={handleProcess} disabled={busy} data-testid="process-print-queue">
              {busy ? <Loader2 className="size-3 mr-1 animate-spin" /> : <RotateCcw className="size-3 mr-1" />}
              Process Queue
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3 flex-wrap">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {f} {f !== 'all' && counts[f] ? `(${counts[f]})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No print jobs</div>
        ) : (
          <div className="max-h-80 divide-y overflow-auto rounded-lg border">
            {filtered.map((job) => {
              const style = STATUS_STYLES[job.status] || STATUS_STYLES.pending;
              const Icon = style.icon;
              const canRetry = job.status === 'failed' || job.status === 'retry';
              const canCancel = job.status === 'pending' || job.status === 'retry';
              return (
                <div key={job.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Icon className="size-4" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs">#{job.id}</span>
                      <Badge className={cn('text-[10px]', style.className)}>{job.status}</Badge>
                      <span className="text-xs capitalize text-muted-foreground">{job.doc_type}</span>
                    </div>
                    {job.last_error && <p className="mt-0.5 truncate text-xs text-destructive">{job.last_error}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      Attempt {job.retry_count}/3 · {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {canRetry && (
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => void handleRetry(job.id)}>
                        <RotateCcw className="size-3.5" />
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive hover:text-destructive"
                        onClick={() => void handleCancel(job.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <TestPrintDialog open={showTest} onOpenChange={setShowTest} />
    </Card>
  );
}
