// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQrSession,
  isQrCaptureSupported,
  QrSessionError,
} from '@/lib/ess/attendance/qr-session';

type TrackLike = { stop: ReturnType<typeof vi.fn> };

function makeStream(tracks: TrackLike[]): MediaStream {
  return { getTracks: () => tracks } as unknown as MediaStream;
}

function makeVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.play = vi.fn(async () => undefined);
  return video;
}

function stubGetUserMedia(impl?: { rejectName?: string }): ReturnType<typeof vi.fn> {
  const getUserMedia = vi.fn(async () => {
    if (impl?.rejectName) {
      const err = new Error('denied');
      err.name = impl.rejectName;
      throw err;
    }
    return makeStream([{ stop: vi.fn() }]);
  });
  vi.stubGlobal('navigator', { ...window.navigator, mediaDevices: { getUserMedia } });
  return getUserMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('QR capture session (BRD FR-01/FR-04)', () => {
  it('reports unsupported without a camera API', async () => {
    vi.stubGlobal('navigator', { ...window.navigator, mediaDevices: undefined });
    expect(isQrCaptureSupported()).toBe(false);
    await expect(createQrSession(makeVideo(), { onText: vi.fn() })).rejects.toMatchObject({
      code: 'not_supported',
    });
  });

  it('maps a denied camera permission to permission_denied', async () => {
    stubGetUserMedia({ rejectName: 'NotAllowedError' });
    const err = await createQrSession(makeVideo(), { onText: vi.fn() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QrSessionError);
    expect((err as QrSessionError).code).toBe('permission_denied');
  });

  it('maps a busy camera to in_use', async () => {
    stubGetUserMedia({ rejectName: 'NotReadableError' });
    const err = await createQrSession(makeVideo(), { onText: vi.fn() }).catch((e: unknown) => e);
    expect((err as QrSessionError).code).toBe('in_use');
  });

  it('attaches the stream and decodes via BarcodeDetector, stopping after the first hit', async () => {
    stubGetUserMedia();
    const detect = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rawValue: 'WEHAATT:abc' }]);
    vi.stubGlobal('BarcodeDetector', class {
      detect = detect;
    });
    const video = makeVideo();
    const onText = vi.fn();

    const session = await createQrSession(video, { onText });

    expect(session.active).toBe(true);
    expect(video.srcObject).not.toBeNull();
    expect(video.muted).toBe(true);

    await vi.advanceTimersByTimeAsync(250);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(onText).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    expect(onText).toHaveBeenCalledWith('WEHAATT:abc');
    expect(session.active).toBe(false);
  });

  it('stop() releases every track and is idempotent', async () => {
    const tracks: TrackLike[] = [{ stop: vi.fn() }, { stop: vi.fn() }];
    vi.stubGlobal('navigator', {
      ...window.navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => makeStream(tracks)) },
    });
    vi.stubGlobal('BarcodeDetector', class {
      detect = vi.fn(async () => []);
    });
    const video = makeVideo();

    const session = await createQrSession(video, { onText: vi.fn() });
    session.stop();
    session.stop();

    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(session.active).toBe(false);

    // Decoding loop is dead after stop — nothing further fires.
    await vi.advanceTimersByTimeAsync(1000);
  });
});
