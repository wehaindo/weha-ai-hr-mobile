'use client';

// FR-02/§7A: method selection + the check-in/out action, with the GPS
// capture strip and error guidance (FR-03/FR-08). Disabled states always
// carry a reason — capability discovery, never assumption (FR-01).

import { MapPin, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceCapture, AttendanceCaptureError, AttendanceMethodChoice, MethodAvailability } from '@/hooks/useAttendance';

interface PunchCardProps {
  expectedNext: 'CHECK_IN' | 'CHECK_OUT' | null;
  availability: Record<AttendanceMethodChoice, MethodAvailability>;
  choice: AttendanceMethodChoice;
  onChoice: (choice: AttendanceMethodChoice) => void;
  capture: AttendanceCapture | null;
  captureError: AttendanceCaptureError | null;
  busy: boolean;
  onPunch: () => void;
  onOpenScanner: () => void;
}

export function PunchCard({
  expectedNext,
  availability,
  choice,
  onChoice,
  capture,
  captureError,
  busy,
  onPunch,
  onOpenScanner,
}: PunchCardProps) {
  const actionLabel = expectedNext === 'CHECK_OUT' ? 'Check out' : 'Check in';
  const locating = capture?.method === 'GPS' && capture.phase === 'locating';
  const evaluation = capture?.method === 'GPS' ? capture.evaluation : undefined;
  const methodReady = availability[choice].available;

  return (
    <Card data-testid="punch-card">
      <CardHeader className="pb-2">
        <CardDescription>Record attendance</CardDescription>
        <CardTitle className="text-lg">Punch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={choice === 'GPS' ? 'default' : 'outline'}
            className="min-h-11 justify-start gap-2"
            data-testid="method-gps"
            aria-pressed={choice === 'GPS'}
            disabled={!availability.GPS.available}
            title={availability.GPS.reason}
            onClick={() => onChoice('GPS')}
          >
            <MapPin className="h-4 w-4" aria-hidden /> GPS
          </Button>
          <Button
            type="button"
            variant={choice === 'QR' ? 'default' : 'outline'}
            className="min-h-11 justify-start gap-2"
            data-testid="method-qr"
            aria-pressed={choice === 'QR'}
            disabled={!availability.QR.available}
            title={availability.QR.reason}
            onClick={() => onChoice('QR')}
          >
            <QrCode className="h-4 w-4" aria-hidden /> QR code
          </Button>
        </div>

        <Button
          type="button"
          className="min-h-11 w-full text-base"
          data-testid="punch-action"
          disabled={!methodReady || busy || expectedNext === null}
          onClick={() => (choice === 'GPS' ? void onPunch() : onOpenScanner())}
        >
          {busy || locating ? 'Working…' : choice === 'QR' ? 'Scan QR to punch' : actionLabel}
        </Button>

        {!methodReady && availability[choice].reason && (
          <p className="text-xs text-muted-foreground" data-testid="method-unavailable-reason">
            {availability[choice].reason}
          </p>
        )}
        {expectedNext === null && methodReady && (
          <p className="text-xs text-muted-foreground">No punches are expected today.</p>
        )}

        {locating && (
          <p className="text-sm text-muted-foreground" data-testid="gps-locating">
            Acquiring your location…
          </p>
        )}
        {evaluation && !captureError && (
          <div className="rounded-md border p-3 text-xs text-muted-foreground" data-testid="gps-evaluation">
            <p>
              Worksite distance: <strong data-testid="gps-distance">{Math.round(evaluation.distanceMeters)} m</strong>
              {' · '}
              within {evaluation.withinRadius ? 'the' : 'outside the'} allowed radius
            </p>
          </div>
        )}
        {captureError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="attendance-capture-error"
            data-code={captureError.code}
          >
            {captureError.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
