'use client';

// "My attendance" dashboard section — the full attendance experience that
// previously lived on /attendance: status, punch action with method discovery,
// GPS/QR capture, confirmation outcomes and the sync queue surface.

import { useEffect, useState } from 'react';
import { useAttendance, type AttendanceMethodChoice } from '@/hooks/useAttendance';
import { AttendanceStatusCard } from '@/components/ess/attendance/attendance-status-card';
import { PendingEventsCard } from '@/components/ess/attendance/pending-events-card';
import { PunchCard } from '@/components/ess/attendance/punch-card';
import { PunchConfirmation } from '@/components/ess/attendance/punch-confirmation';
import { QrCapturePanel } from '@/components/ess/attendance/qr-capture-panel';
import { TodayPunchesList } from '@/components/ess/attendance/today-punches-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function AttendanceSection() {
  const {
    state,
    capture,
    captureError,
    confirmation,
    busy,
    methodAvailability,
    reload,
    punchWithGps,
    startQrScan,
    stopQrScan,
    retryQueue,
    dismissConfirmation,
  } = useAttendance();

  const [choice, setChoice] = useState<AttendanceMethodChoice>('GPS');
  const [qrOpen, setQrOpen] = useState(false);

  // Close the scanner when startup failed (error surfaced) or a punch settled.
  useEffect(() => {
    if (qrOpen && !capture && (captureError || busy || confirmation)) setQrOpen(false);
  }, [qrOpen, capture, captureError, busy, confirmation]);

  // Prefer GPS when it isn't actually available (e.g. local or unsupported).
  useEffect(() => {
    if (state.status === 'ready' && choice === 'GPS' && !methodAvailability.GPS.available && methodAvailability.QR.available) {
      setChoice('QR');
    }
  }, [state.status, choice, methodAvailability]);

  return (
    <section className="space-y-4" data-testid="attendance-section">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          My attendance
        </h3>
        <p className="text-sm text-muted-foreground">
          Check in and out with GPS or a worksite QR code — every punch is confirmed by the server.
        </p>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-11 w-40" />
          </CardContent>
        </Card>
      ) : state.status === 'no_session' ? (
        <Card data-testid="attendance-no-session">
          <CardHeader className="pb-2">
            <CardDescription>Attendance</CardDescription>
            <CardTitle className="text-lg">No employee session on this device</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sign in with your WEHA account to record attendance against your employee record.
          </CardContent>
        </Card>
      ) : state.status === 'error' ? (
        <Card data-testid="attendance-error">
          <CardHeader className="pb-2">
            <CardDescription>Attendance</CardDescription>
            <CardTitle className="text-lg">Could not load attendance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{state.error.message}</span>
            <Button variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (() => {
        const { status, pending, localToday } = state.data;
        return (
          <>
            <AttendanceStatusCard data={state.data} />

            <div className="grid gap-6 sm:grid-cols-2">
              <PunchCard
                expectedNext={status.expectedNext ?? null}
                availability={methodAvailability}
                choice={choice}
                onChoice={setChoice}
                capture={capture}
                captureError={qrOpen ? null : captureError}
                busy={busy}
                onPunch={() => void punchWithGps()}
                onOpenScanner={() => setQrOpen(true)}
              />

              {qrOpen && (
                <QrCapturePanel
                  scanning={capture?.method === 'QR'}
                  error={captureError}
                  onScan={(video) => void startQrScan(video)}
                  onStop={stopQrScan}
                  onCancel={() => {
                    stopQrScan();
                    setQrOpen(false);
                  }}
                />
              )}
            </div>

            {confirmation && <PunchConfirmation confirmation={confirmation} onDismiss={dismissConfirmation} />}

            <PendingEventsCard pending={pending} busy={busy} onRetry={retryQueue} />

            <TodayPunchesList serverToday={status.today} localToday={localToday} />
          </>
        );
      })()}
    </section>
  );
}
