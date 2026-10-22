'use client';

// FR-05/FR-09: the sync-pending surface — queued/failed offline events with a
// manual retry. Rendered only when something is actually unresolved.

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceQueueRow } from '@/lib/ess/attendance/queue';

export function PendingEventsCard({
  pending,
  busy,
  onRetry,
}: {
  pending: AttendanceQueueRow[];
  busy: boolean;
  onRetry: () => void;
}) {
  if (pending.length === 0) return null;
  const failed = pending.filter((row) => row.status === 'failed');

  return (
    <Card data-testid="pending-card">
      <CardHeader className="pb-2">
        <CardDescription>Synchronization</CardDescription>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span data-testid="pending-count">{pending.length}</span> event{pending.length === 1 ? '' : 's'} waiting to sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {pending.map((row) => (
            <li key={row.id} data-testid="pending-item" data-status={row.status} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {row.method} · {new Date(row.captured_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                {row.last_error ? ` — ${row.last_error}` : ''}
              </span>
              <span className="text-xs">{row.status === 'failed' ? 'needs retry' : 'queued'}</span>
            </li>
          ))}
        </ul>
        {failed.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="retry-queue"
            disabled={busy}
            onClick={() => void onRetry()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Retry {failed.length} failed
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
