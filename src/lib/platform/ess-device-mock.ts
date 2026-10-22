// Deterministic mock of the ESS device adapter for development and tests:
// fixed capabilities, injectable init failure, observable listener cleanup.

import type { PlatformKind } from '@/platform';
import {
  EssDeviceError,
  type EssCapability,
  type EssDeviceInfo,
  type EssDeviceAdapter,
} from './ess-device';

export interface MockEssDeviceOptions {
  platform?: PlatformKind;
  capabilities?: EssCapability[];
  deviceInfo?: Partial<EssDeviceInfo>;
  /** When set, initialize() rejects with this message. */
  failInitWith?: string;
}

export interface MockEssDeviceAdapter extends EssDeviceAdapter {
  /** Number of listeners not yet cleaned up — asserts dispose() behavior. */
  remainingListeners(): number;
  readonly disposed: boolean;
}

export function createMockEssDeviceAdapter(options: MockEssDeviceOptions = {}): MockEssDeviceAdapter {
  const listeners = new Set<() => void>();
  let disposed = false;

  return {
    getPlatform: () => options.platform ?? 'web',

    getCapabilities: async () => options.capabilities ?? ['notifications'],

    getDeviceInfo: async () => {
      if (options.failInitWith) {
        throw new EssDeviceError('unavailable', 'Device information is not available right now.');
      }
      return {
        appName: 'ESS Mock',
        appVersion: '0.0.0-mock',
        platform: options.platform ?? 'web',
        ...options.deviceInfo,
      };
    },

    initialize: async () => {
      if (options.failInitWith) {
        throw new EssDeviceError('init_failed', options.failInitWith);
      }
    },

    on: () => {
      const off = () => listeners.delete(off);
      listeners.add(off);
      return off;
    },

    dispose: async () => {
      for (const off of listeners) off();
      listeners.clear();
      disposed = true;
    },

    remainingListeners: () => listeners.size,
    get disposed() {
      return disposed;
    },
  };
}
