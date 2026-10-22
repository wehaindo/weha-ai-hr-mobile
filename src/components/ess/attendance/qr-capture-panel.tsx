'use client';

// FR-01/FR-04 QR capture: owns the <video> element, starts the scan session
// on mount and ALWAYS releases the camera on unmount.

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceCaptureError } from '@/hooks/useAttendance';

interface QrCapturePanelProps {
  scanning: boolean;
  error: AttendanceCaptureError | null;
  onScan: (video: HTMLVideoElement) => void;
  onStop: () => void;
  onCancel: () => void;
}

export function QrCapturePanel({ scanning, error, onScan, onStop, onCancel }: QrCapturePanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) onScan(video);
    return () => onStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once on mount; cleanup always stops
  }, []);

  return (
    <Card data-testid="qr-panel">
      <CardHeader className="pb-2">
        <CardDescription>Scan the worksite QR code</CardDescription>
        <CardTitle className="text-lg">QR attendance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <video
          ref={videoRef}
          data-testid="qr-video"
          className="aspect-video w-full rounded-md bg-black object-cover"
          muted
          playsInline
          autoPlay
        />
        <p className="text-sm text-muted-foreground" data-testid="qr-hint">
          {scanning ? 'Point the camera at the worksite QR code…' : 'Starting camera…'}
        </p>
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="attendance-capture-error"
            data-code={error.code}
          >
            {error.message}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" data-testid="qr-cancel" onClick={onCancel}>
          Cancel scan
        </Button>
      </CardContent>
    </Card>
  );
}
