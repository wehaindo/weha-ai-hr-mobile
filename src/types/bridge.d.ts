import type { DeviceBridge } from '@/platform/bridge';

declare global {
  interface Window {
    deviceBridge?: DeviceBridge;
  }
}

export {};
