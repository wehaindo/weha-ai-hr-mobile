// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQrSession, isQrCaptureSupported, QrSessionError } from '@/lib/scan/qr-session';

// vi.mock hoists, so define the jsQR mock before the import resolves.
const jsQrMock = vi.fn();
vi.mock('jsqr', () => ({ default: (d: unknown) => jsQrMock(d) }));

function fakeTrack() {
  return { stop: vi.fn() };
}

function fakeStream(tracks: ReturnType<typeof fakeTrack>[]) {
  return { getTracks: () => tracks } as unknown as MediaStream;
}

function stubGetUserMedia(impl: (constraints: unknown) => Promise<MediaStream>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(impl);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: fn },
    configurable: true,
  });
  return fn;
}

function makeVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  // jsdom has no real media playback; stub what the session touches.
  Object.defineProperty(video, 'play', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  Object.defineProperty(video, 'videoWidth', { value: 100, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 100, configurable: true });
  return video;
}

/** jsdom's 2d context can't drawImage a video — substitute a permissive stub. */
function stubCanvasContext(): void {
  const ctx = {
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  };
  // Re-type the spy as a loose mock: getContext's overloads (2d / webgl / webgpu…)
  // shift across DOM/@types versions, so we avoid binding to a specific return type.
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as ReturnType<typeof vi.fn>;
  spy.mockReturnValue(ctx);
}

describe('qr session', () => {
  beforeEach(() => {
    jsQrMock.mockReset();
    stubCanvasContext();
    // No native BarcodeDetector → the jsQR path is exercised by default.
    (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports unsupported without getUserMedia', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    expect(isQrCaptureSupported()).toBe(false);
  });

  it('throws not_supported when capture is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    await expect(createQrSession(makeVideo(), { onText: vi.fn() })).rejects.toMatchObject({
      code: 'not_supported',
    });
  });

  it('maps a NotAllowedError to permission_denied', async () => {
    stubGetUserMedia(async () => {
      const err = new Error('denied');
      err.name = 'NotAllowedError';
      throw err;
    });
    await expect(createQrSession(makeVideo(), { onText: vi.fn() })).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  it('starts a session, emits the first decoded text, and stops the camera', async () => {
    const track = fakeTrack();
    stubGetUserMedia(async () => fakeStream([track]));
    jsQrMock.mockReturnValue({ data: 'HELLO' });

    const onText = vi.fn();
    const video = makeVideo();
    const session = await createQrSession(video, { onText });

    expect(session.active).toBe(true);
    expect(video.srcObject).toBeTruthy();

    // jsQR runs on an interval; advance until the decode fires.
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith('HELLO'));
    await vi.waitFor(() => expect(session.active).toBe(false));

    // Camera track released + srcObject cleared on stop.
    expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();

    session.stop(); // idempotent — no throw
  });

  it('stop() releases the camera even before any decode', async () => {
    const track = fakeTrack();
    stubGetUserMedia(async () => fakeStream([track]));
    jsQrMock.mockReturnValue(null);

    const video = makeVideo();
    const session = await createQrSession(video, { onText: vi.fn() });
    session.stop();

    expect(session.active).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it('uses BarcodeDetector when available instead of jsQR', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: 'NATIVE' }]);
    class FakeDetector {
      detect = detect;
    }
    (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = FakeDetector;
    const track = fakeTrack();
    stubGetUserMedia(async () => fakeStream([track]));

    const onText = vi.fn();
    const session = await createQrSession(makeVideo(), { onText });

    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith('NATIVE'));
    expect(jsQrMock).not.toHaveBeenCalled();
    session.stop();
  });

  it('QrSessionError carries a machine-readable code', () => {
    const err = new QrSessionError('in_use', 'busy');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('in_use');
    expect(err.name).toBe('QrSessionError');
  });
});
