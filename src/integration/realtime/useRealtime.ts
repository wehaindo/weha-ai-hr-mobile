'use client';

// Renderer realtime hook — connects via the DeviceBridge realtime capability
// (Electron main ws, or browser WebSocket on web/Capacitor) and subscribes to
// status + command events. Server commands are dispatched as window CustomEvents
// so any part of the app can react (lock/unlock/logout/refresh/print_test/...).

import { useCallback, useEffect, useState } from 'react';
import { useBridge, type RealtimeStatus } from '@/platform';

export interface RealtimeState {
  status: RealtimeStatus;
  isConnected: boolean;
  posId: string | null;
}

/** Window event names emitted for each realtime command (ai-pos parity). */
export const REALTIME_COMMAND_EVENTS: Record<string, string> = {
  lock_pos: 'pos:lock',
  unlock_pos: 'pos:unlock',
  logout_cashier: 'pos:logout',
  refresh_pos: 'pos:refresh',
  clear_cache: 'pos:clear-cache',
} as const;

export function useRealtime() {
  const bridge = useBridge();
  const [state, setState] = useState<RealtimeState>({ status: 'offline', isConnected: false, posId: null });

  useEffect(() => {
    const offStatus = bridge.events.on('realtime:status', ({ status }) => {
      setState((prev) => ({ ...prev, status }));
    });

    const offCommand = bridge.events.on('realtime:command', ({ command, payload }) => {
      // Fan out to window CustomEvents so app code can subscribe without the bridge.
      const eventName = REALTIME_COMMAND_EVENTS[command];
      if (eventName && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
      }
    });

    void bridge.realtime.getStatus().then((s) => {
      setState((prev) => ({ ...prev, isConnected: s.isConnected, status: s.status, posId: s.posId }));
    });

    return () => {
      offStatus();
      offCommand();
    };
  }, [bridge]);

  const refreshStatus = useCallback(async () => {
    const s = await bridge.realtime.getStatus();
    setState((prev) => ({ ...prev, isConnected: s.isConnected, status: s.status, posId: s.posId }));
  }, [bridge]);

  return { state, refreshStatus };
}
