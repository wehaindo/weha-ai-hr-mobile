'use client';

// FR-07: unambiguous outcomes — Recorded (server confirmed), Pending
// synchronization, Rejected (with reason), Already recorded (duplicate).
// Only server values are rendered as confirmed; local capture time is
// labelled as captured, never as recorded.

import { CheckCircle2, Clock3, ShieldAlert, UploadCloud, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceConfirmation } from '@/hooks/useAttendance';

export const REJECTION_LABELS: Record<string, string> = {
  outside_geofence: 'Outside the authorized worksite area',
  accuracy_too_low: 'GPS accuracy too low',
  invalid_qr: 'Invalid QR code',
  expired_qr: 'QR code expired',
  method_not_allowed: 'Method not allowed by company policy',
  stale_capture: 'Capture too old to sync',
  corrupt_payload: 'Stored event was damaged',
  rejected: 'Rejected by the server',
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface Row {
  label: string;
  value: string;
  testid?: string;
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <div className="divide-y">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-1.5 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="break-all text-right font-medium" data-testid={row.testid}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const CONTENT: Record<
  AttendanceConfirmation['kind'],
  { title: string; description: string; icon: typeof CheckCircle2 }
> = {
  recorded: { title: 'Attendance recorded', description: 'Confirmed by the server.', icon: CheckCircle2 },
  duplicate: { title: 'Already recorded', description: 'This punch matched an existing event.', icon: ShieldAlert },
  rejected: { title: 'Attendance rejected', description: 'The event was not accepted.', icon: ShieldAlert },
  pending: { title: 'Pending synchronization', description: 'Saved on this device, waiting for the server.', icon: Clock3 },
};

export function PunchConfirmation({
  confirmation,
  onDismiss,
}: {
  confirmation: AttendanceConfirmation;
  onDismiss: () => void;
}) {
  const content = CONTENT[confirmation.kind];
  const Icon = content.icon;

  const rows: Row[] =
    confirmation.kind === 'recorded' || confirmation.kind === 'duplicate'
      ? [
          {
            label: 'Action',
            value:
              confirmation.event.attendanceType === 'CHECK_OUT'
                ? 'Check-out'
                : confirmation.event.attendanceType === 'CHECK_IN'
                  ? 'Check-in'
                  : 'Punch',
          },
          { label: 'Time', value: formatTime(confirmation.event.recordedAt), testid: 'confirmation-time' },
          { label: 'Method', value: confirmation.event.method },
          {
            label: 'Worksite',
            value: confirmation.event.worksite?.name ?? '—',
          },
          { label: 'Status', value: confirmation.kind === 'duplicate' ? 'Already recorded' : 'Server confirmed', testid: 'confirmation-status' },
        ]
      : confirmation.kind === 'rejected'
        ? [
            {
              label: 'Reason',
              value: REJECTION_LABELS[confirmation.reason] ?? confirmation.reason,
              testid: 'confirmation-reason',
            },
            { label: 'Submitted', value: confirmation.server ? 'Yes — server rejected it' : 'No — blocked on this device', testid: 'confirmation-submitted' },
          ]
        : [
            { label: 'Captured', value: formatTime(confirmation.capturedAt), testid: 'confirmation-time' },
            { label: 'Status', value: 'Waiting to sync', testid: 'confirmation-status' },
          ];

  return (
    <Card data-testid="punch-confirmation" data-kind={confirmation.kind}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5" aria-hidden />
            <div>
              <CardDescription>{content.description}</CardDescription>
              <CardTitle className="text-lg" data-testid="confirmation-title">
                {content.title}
              </CardTitle>
            </div>
          </div>
          <Button variant="ghost" size="sm" data-testid="confirmation-dismiss" onClick={onDismiss} aria-label="Dismiss">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Rows rows={rows} />
        {confirmation.kind === 'pending' && (
          <p className="pt-2 text-xs text-muted-foreground">
            <UploadCloud className="mr-1 inline h-3 w-3" aria-hidden />
            It will be sent automatically when the connection returns. Your device time is shown above —
            the server records the authoritative time.
          </p>
        )}
        {confirmation.kind === 'duplicate' && confirmation.event.duplicateOfEventId && (
          <p className="pt-2 text-xs text-muted-foreground">
            Original event: <Badge variant="outline">{confirmation.event.duplicateOfEventId}</Badge>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
