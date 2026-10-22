'use client';

// §7A: today's punches — server-confirmed events first, then local queue rows
// the server has not confirmed yet (pending) or local policy rejections.

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceEventResult } from '@/integration/ess/attendance';
import type { AttendanceQueueRow } from '@/lib/ess/attendance/queue';
import { REJECTION_LABELS } from './punch-confirmation';

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'ACCEPTED' ? 'default' : status === 'REJECTED' || status === 'failed' ? 'destructive' : 'secondary';
  return (
    <Badge variant={variant} data-testid="today-item-status">
      {status === 'ACCEPTED'
        ? 'Recorded'
        : status === 'REJECTED'
          ? 'Rejected'
          : status === 'DUPLICATE'
            ? 'Duplicate'
            : status === 'failed'
              ? 'Failed'
              : 'Pending'}
    </Badge>
  );
}

export function TodayPunchesList({
  serverToday,
  localToday,
}: {
  serverToday: AttendanceEventResult[];
  localToday: AttendanceQueueRow[];
}) {
  const serverIds = new Set(serverToday.map((e) => e.id));
  const localOnly = localToday.filter((row) => !serverIds.has(row.id) && row.status !== 'accepted');

  return (
    <Card data-testid="today-list">
      <CardHeader className="pb-2">
        <CardDescription>Today&apos;s punches</CardDescription>
        <CardTitle className="text-lg">Recorded today</CardTitle>
      </CardHeader>
      <CardContent>
        {serverToday.length === 0 && localOnly.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="today-empty">
            Nothing recorded yet today.
          </p>
        ) : (
          <div className="divide-y">
            {serverToday.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
                data-testid="today-item"
                data-source="server"
              >
                <div>
                  <p className="font-medium">
                    {event.attendanceType === 'CHECK_OUT' ? 'Check-out' : 'Check-in'} ·{' '}
                    <span data-testid="today-item-time">{formatTime(event.recordedAt)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.method}
                    {event.worksite ? ` · ${event.worksite.name}` : ''}
                    {event.rejectionReason
                      ? ` · ${REJECTION_LABELS[event.rejectionReason] ?? event.rejectionReason}`
                      : ''}
                  </p>
                </div>
                <StatusBadge status={event.status} />
              </div>
            ))}
            {localOnly.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
                data-testid="today-item"
                data-source="local"
              >
                <div>
                  <p className="font-medium">
                    {row.attendance_type === 'CHECK_OUT' ? 'Check-out' : row.attendance_type === 'CHECK_IN' ? 'Check-in' : 'Punch'} ·{' '}
                    <span data-testid="today-item-time">{formatTime(row.captured_at)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.method}
                    {row.rejection_reason
                      ? ` · ${REJECTION_LABELS[row.rejection_reason] ?? row.rejection_reason}`
                      : ' · captured on this device'}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
