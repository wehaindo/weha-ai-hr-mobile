'use client';

// Sample scan + locate page — the template a device app copies when it needs
// to capture input from the device. Demonstrates the two framework capture
// primitives end-to-end:
//   • QR / barcode scanning via the reusable <QrScanner> component
//     (src/components/scan/qr-scanner.tsx → src/lib/scan/qr-session.ts),
//   • a GPS fix via the bridge.location capability.
// Both are permission-gated at the nav item (`transactions.use`) so a role
// without it never reaches this page. To attribute a capture to a record,
// persist it (bridge.db) and/or enqueue it like the transactions sample does.

import { useCallback, useState } from 'react';
import { useBridge, type GeoFix } from '@/platform';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import QrScanner from '@/components/scan/qr-scanner';
import { Crosshair, QrCode } from 'lucide-react';

interface Capture {
  kind: 'qr' | 'gps';
  summary: string;
  detail: string;
  at: string;
}

function formatFix(fix: GeoFix): { summary: string; detail: string } {
  return {
    summary: `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}`,
    detail: `±${Math.round(fix.accuracyMeters)} m · ${fix.capturedAt}`,
  };
}

export default function ScanLocatePage() {
  const bridge = useBridge();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<{ code: 'permission' | 'unsupported' | 'in_use' | 'unknown'; message: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoSupported, setGeoSupported] = useState<boolean | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);

  const record = useCallback((capture: Capture) => {
    setCaptures((prev) => [capture, ...prev].slice(0, 20));
  }, []);

  const handleScan = useCallback(
    (text: string) => {
      setScanning(false);
      setScanError(null);
      record({ kind: 'qr', summary: text, detail: 'Decoded from camera', at: new Date().toISOString() });
      toast.add({ title: 'QR captured', description: text, type: 'success' });
    },
    [record]
  );

  const handleScanCancel = useCallback(() => {
    setScanning(false);
    setScanError(null);
  }, []);

  const captureLocation = useCallback(async () => {
    setLocating(true);
    setScanError(null);
    try {
      const supported = (await bridge.location.permission()) !== 'unsupported';
      setGeoSupported(supported);
      if (!supported) {
        toast.add({ title: 'Location is not available on this device', type: 'error' });
        return;
      }
      const fix = await bridge.location.getCurrent();
      const { summary, detail } = formatFix(fix);
      record({ kind: 'gps', summary, detail, at: fix.capturedAt });
      toast.add({ title: 'Location captured', description: summary, type: 'success' });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.add({
        title: 'Location failed',
        description:
          code === 'permission_denied'
            ? 'Location permission is denied. Allow it in your device settings.'
            : code === 'timeout'
              ? 'Location timed out. Move to an open area and try again.'
              : 'Could not get your location.',
        type: 'error',
      });
    } finally {
      setLocating(false);
    }
  }, [bridge, record]);

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="scan-locate-page">
      <Card>
        <CardHeader>
          <CardTitle>Scan QR code</CardTitle>
          <CardDescription>
            Camera capture via <code>&lt;QrScanner&gt;</code> — uses BarcodeDetector when available,
            jsQR otherwise. The camera is released when scanning stops.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {scanning ? (
            <QrScanner onScan={handleScan} onCancel={handleScanCancel} error={scanError} />
          ) : (
            <Button data-testid="scan-start" onClick={() => setScanning(true)}>
              <QrCode className="size-4 mr-2" />
              Start scanning
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capture location</CardTitle>
          <CardDescription>
            A single GPS fix via <code>bridge.location.getCurrent()</code> — accuracy is the
            device-reported radius, never a guarantee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button data-testid="locate-start" disabled={locating} onClick={() => void captureLocation()}>
            <Crosshair className="size-4 mr-2" />
            {locating ? 'Locating…' : 'Get location'}
          </Button>
          {geoSupported === false && (
            <p className="text-sm text-muted-foreground" data-testid="locate-unsupported">
              Location is not available on this device.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Captures</CardTitle>
          <CardDescription>This session only — persist to the database in a real feature</CardDescription>
        </CardHeader>
        <CardContent>
          {captures.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="captures-empty">
              No captures yet — scan a code or get a location above.
            </p>
          ) : (
            <ul className="divide-y" data-testid="captures-list">
              {captures.map((capture, index) => (
                <li key={`${capture.at}-${index}`} className="flex items-start justify-between gap-3 py-2" data-testid={`capture-${capture.kind}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{capture.summary}</p>
                    <p className="text-xs text-muted-foreground">{capture.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={capture.kind === 'qr' ? 'default' : 'secondary'}>{capture.kind.toUpperCase()}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(capture.at).toLocaleTimeString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
