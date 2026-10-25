// Live QR capture — app-side on purpose: MediaStream and HTMLVideoElement
// cannot cross Electron's contextBridge, and getUserMedia is the same web API
// on web, Capacitor and Electron renderers. Native BarcodeDetector when
// available (Chrome/Android), jsQR fallback for Safari/iOS. The session releases
// every track on stop() — call it on unmount. Ported from weha-ai-hrd-mobile.

import jsQR from 'jsqr';

export type QrSessionErrorCode = 'not_supported' | 'permission_denied' | 'in_use' | 'unknown';

export class QrSessionError extends Error {
  readonly code: QrSessionErrorCode;

  constructor(code: QrSessionErrorCode, message: string) {
    super(message);
    this.name = 'QrSessionError';
    this.code = code;
  }
}

export interface QrSession {
  /** Release the camera and stop decoding. Idempotent. */
  stop(): void;
  readonly active: boolean;
}

/** Camera capture is available (web/Capacitor/Electron renderer all qualify). */
export function isQrCaptureSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

const DECODE_INTERVAL_MS = 250;

function mapMediaError(err: unknown): QrSessionError {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new QrSessionError('permission_denied', 'Camera permission was denied.');
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return new QrSessionError('in_use', 'The camera is unavailable or in use by another app.');
  }
  return new QrSessionError('unknown', 'Could not start the camera.');
}

/**
 * Open the rear camera and decode QR frames until the first hit (then the
 * session stops itself) or `stop()`/an error ends it.
 */
export async function createQrSession(
  video: HTMLVideoElement,
  callbacks: { onText: (text: string) => void }
): Promise<QrSession> {
  if (!isQrCaptureSupported()) {
    throw new QrSessionError('not_supported', 'Camera capture is not available on this device.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch (err) {
    throw mapMediaError(err);
  }

  let active = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    active = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const emit = (text: string): void => {
    if (!active) return;
    stop();
    callbacks.onText(text);
  };

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true; // iOS Safari: inline playback, no fullscreen takeover
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    /* autoplay races are harmless — frames still decode once playback starts */
  }

  const Detector = getBarcodeDetector();
  if (Detector) {
    const detector = new Detector({ formats: ['qr_code'] });
    timer = setInterval(() => {
      if (!active) return;
      void detector
        .detect(video)
        .then((hits) => {
          const value = hits[0]?.rawValue;
          if (value) emit(value);
        })
        .catch(() => {
          /* transient detect failures (no frame yet) — keep polling */
        });
    }, DECODE_INTERVAL_MS);
  } else {
    // jsQR fallback: sample the video into a canvas ~4×/s.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    timer = setInterval(() => {
      if (!active || !ctx || video.readyState < 2) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (canvas.width === 0 || canvas.height === 0) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(frame.data, frame.width, frame.height);
        if (found?.data) emit(found.data);
      } catch {
        /* tainted/zero frame — retry next tick */
      }
    }, DECODE_INTERVAL_MS);
  }

  return {
    stop,
    get active() {
      return active;
    },
  };
}
