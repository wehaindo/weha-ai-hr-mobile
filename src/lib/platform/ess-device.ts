// ESS device adapter — the ESS-facing capability contract (BRD §7.2) as a
// thin facade over the framework's DeviceBridge. Capability detection is
// honest: only capabilities the adapter can actually serve today are
// returned; declared-but-missing ones simply don't appear (never crash).

import type { DeviceBridge, DeviceBridgeEventMap, PlatformKind } from '@/platform';

/** Declared ESS capability set. Only a subset is available per platform. */
export type EssCapability = 'camera' | 'qr-scan' | 'rfid' | 'fingerprint' | 'location' | 'notifications';

export type EssErrorCode = 'not_supported' | 'permission_denied' | 'init_failed' | 'unavailable';

export class EssDeviceError extends Error {
  readonly code: EssErrorCode;

  constructor(code: EssErrorCode, message: string) {
    super(message);
    this.name = 'EssDeviceError';
    this.code = code;
  }
}

export interface EssDeviceInfo {
  appName: string;
  appVersion: string;
  /** Framework platform: 'web' (PWA) | 'capacitor' (Android WebView) | 'electron'. */
  platform: PlatformKind;
  deviceName?: string;
}

export interface EssDeviceAdapter {
  getPlatform(): PlatformKind;
  getCapabilities(): Promise<EssCapability[]>;
  getDeviceInfo(): Promise<EssDeviceInfo>;
  initialize(): Promise<void>;
  /** Subscribe to a bridge event; the subscription is cleaned up by dispose(). */
  on<K extends keyof DeviceBridgeEventMap>(event: K, listener: DeviceBridgeEventMap[K]): () => void;
  dispose(): Promise<void>;
}

function detectCapabilities(): EssCapability[] {
  const caps: EssCapability[] = [];
  // Web Notifications back bridge.notify on the PWA; Android needs a native
  // plugin (Phase 2 gap — see docs/ESS-PHASE1.md).
  if (typeof Notification !== 'undefined') caps.push('notifications');
  // Location: browser geolocation behind DeviceBridge.location (Phase 3).
  if (typeof navigator !== 'undefined' && !!navigator.geolocation) caps.push('location');
  // Camera + QR (Phase 3): getUserMedia present; QR decoding is bundled
  // (BarcodeDetector or the jsQR fallback), so qr-scan follows the camera.
  if (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia) {
    caps.push('camera', 'qr-scan');
  }
  return caps;
}

class BridgeEssDeviceAdapter implements EssDeviceAdapter {
  private initialized = false;
  private disposers = new Set<() => void>();

  constructor(private readonly bridge: DeviceBridge) {}

  getPlatform(): PlatformKind {
    return this.bridge.platform;
  }

  async getCapabilities(): Promise<EssCapability[]> {
    return detectCapabilities();
  }

  async getDeviceInfo(): Promise<EssDeviceInfo> {
    let appName = 'ESS';
    let appVersion = '0.0.0';
    try {
      const info = await this.bridge.appInfo();
      appName = info.name;
      appVersion = info.version;
    } catch {
      throw new EssDeviceError('unavailable', 'Device information is not available right now.');
    }
    let deviceName: string | undefined;
    try {
      deviceName = (await this.bridge.kv.get<string>('device.name')) ?? undefined;
    } catch {
      /* device name is cosmetic */
    }
    return { appName, appVersion, platform: this.bridge.platform, deviceName };
  }

  async initialize(): Promise<void> {
    try {
      await this.bridge.appInfo();
    } catch {
      this.initialized = false;
      throw new EssDeviceError('init_failed', 'Device adapter could not initialize on this platform.');
    }
    this.initialized = true;
  }

  /** Subscribe to a bridge event; the subscription is cleaned up by dispose(). */
  on<K extends keyof DeviceBridgeEventMap>(
    event: K,
    listener: DeviceBridgeEventMap[K]
  ): () => void {
    const off = this.bridge.events.on(event, listener);
    const wrapped = () => off();
    this.disposers.add(wrapped);
    return () => {
      off();
      this.disposers.delete(wrapped);
    };
  }

  async dispose(): Promise<void> {
    for (const dispose of this.disposers) dispose();
    this.disposers.clear();
    this.initialized = false;
  }
}

/** Create the framework-backed ESS adapter (web + Capacitor + Electron). */
export function createEssDeviceAdapter(bridge: DeviceBridge): EssDeviceAdapter {
  return new BridgeEssDeviceAdapter(bridge);
}
