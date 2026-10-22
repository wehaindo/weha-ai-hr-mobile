'use client';

// FR-05/§7A: attendance state, expected next punch and device readiness.

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceViewData } from '@/hooks/useAttendance';

const CURRENT_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not checked in',
  PRESENT: 'Present',
  FINISHED: 'Day finished',
};

const CURRENT_VARIANT: Record<string, 'secondary' | 'default' | 'outline'> = {
  NOT_STARTED: 'outline',
  PRESENT: 'default',
  FINISHED: 'secondary',
};

function ReadinessChip({ testid, label, ready }: { testid: string; label: string; ready: boolean }) {
  return (
    <span
      data-testid={testid}
      data-state={ready ? 'ready' : 'unavailable'}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        ready ? 'border-border text-foreground' : 'border-border text-muted-foreground'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
      />
      {label} {ready ? 'ready' : 'unavailable'}
    </span>
  );
}

export function AttendanceStatusCard({ data }: { data: AttendanceViewData }) {
  const { status, readiness } = data;
  return (
    <Card data-testid="attendance-status-card">
      <CardHeader className="pb-2">
        <CardDescription>Current attendance status</CardDescription>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span data-testid="attendance-current">{CURRENT_LABEL[status.current] ?? status.current}</span>
          <Badge data-testid="attendance-current-badge" variant={CURRENT_VARIANT[status.current] ?? 'secondary'}>
            {status.current}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground" data-testid="attendance-expected-next">
          {status.expectedNext === 'CHECK_IN'
            ? 'Your next action: check in.'
            : status.expectedNext === 'CHECK_OUT'
              ? 'Your next action: check out.'
              : 'No further punches expected today.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <ReadinessChip testid="readiness-gps" label="GPS" ready={readiness.gps === 'ready'} />
          <ReadinessChip testid="readiness-qr" label="QR" ready={readiness.qr === 'ready'} />
          <span
            data-testid="readiness-sync"
            data-state={readiness.syncPending ? 'pending' : 'idle'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              readiness.syncPending ? 'border-amber-500/60 text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
            }`}
          >
            {readiness.syncPending
              ? `Sync pending · ${readiness.pendingCount}`
              : 'All events synced'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
