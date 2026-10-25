'use client';

// Reusable QR scanner: owns the <video> element, starts a scan session on
// mount and ALWAYS releases the camera on unmount. Presentational — the parent
// handles the decoded text and any domain logic.

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createQrSession, QrSessionError, type QrSession } from '@/lib/scan/qr-session';

export type QrScannerErrorCode = 'permission' | 'unsupported' | 'in_use' | 'unknown';

export interface QrScannerProps {
  /** Called with the decoded text of the first valid code (session stops after). */
  onScan: (text: string) => void;
  /** Called when the user taps Cancel. Parent decides whether to close/unmount. */
  onCancel: () => void;
  title?: string;
  description?: string;
  hint?: string;
  /** External error to display (e.g. an invalid code the parent rejected). */
  error?: { code: QrScannerErrorCode; message: string } | null;
}

const ERROR_MESSAGE: Record<QrScannerErrorCode, string> = {
  permission: 'Camera permission is denied. Allow camera access in your device settings.',
  unsupported: 'Camera capture is not available on this device.',
  in_use: 'The camera is unavailable or in use by another app.',
  unknown: 'Could not start the camera.',
};

function toScannerErrorCode(err: unknown): QrScannerErrorCode {
  if (err instanceof QrSessionError) {
    if (err.code === 'permission_denied') return 'permission';
    if (err.code === 'not_supported') return 'unsupported';
    if (err.code === 'in_use') return 'in_use';
  }
  return 'unknown';
}

export default function QrScanner({
  onScan,
  onCancel,
  title = 'Scan QR code',
  description = 'Point the camera at a QR code',
  hint = 'Point the camera at the code…',
  error,
}: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<QrSession | null>(null);
  const onScanRef = useRef(onScan);
  const [startError, setStartError] = useState<{ code: QrScannerErrorCode; message: string } | null>(null);

  // Keep the latest callback without restarting the session.
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    void (async () => {
      try {
        const session = await createQrSession(video, {
          onText: (text) => onScanRef.current(text),
        });
        if (cancelled) {
          session.stop();
          return;
        }
        sessionRef.current = session;
      } catch (err) {
        if (cancelled) return;
        const code = toScannerErrorCode(err);
        setStartError({ code, message: err instanceof Error ? err.message : ERROR_MESSAGE[code] });
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  const shown = error ?? startError;

  return (
    <Card data-testid="qr-scanner">
      <CardHeader className="pb-2">
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <video
          ref={videoRef}
          data-testid="qr-scanner-video"
          className="aspect-video w-full rounded-md bg-black object-cover"
          muted
          playsInline
          autoPlay
        />
        <p className="text-sm text-muted-foreground" data-testid="qr-scanner-hint">
          {shown ? 'Camera unavailable' : hint}
        </p>
        {shown && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="qr-scanner-error"
            data-code={shown.code}
          >
            {shown.message || ERROR_MESSAGE[shown.code]}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" data-testid="qr-scanner-cancel" onClick={onCancel}>
          Cancel scan
        </Button>
      </CardContent>
    </Card>
  );
}
