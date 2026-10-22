// Lifecycle manager for the AI Realtime client. Resolves per-device config
// from device_settings (bridge.kv) with device.config.ts fallbacks, wires the
// auth store so session changes publish simple events, and keeps a single
// running client for the app (settings can restart it in place).

import type { DeviceBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { useAuthStore } from '@/stores/auth';
import { AiRealtimeClient, AI_REALTIME_EVENTS } from './client';

let client: AiRealtimeClient | null = null;
let unsubscribeAuth: (() => void) | null = null;

export function getAiRealtimeClient(): AiRealtimeClient | null {
  return client;
}

/**
 * Starts (or restarts) the AI Realtime client. Returns null when no
 * `aiRealtime.token` credential is configured — the integration is opt-in.
 */
export async function startAiRealtime(bridge: DeviceBridge): Promise<AiRealtimeClient | null> {
  stopAiRealtime();

  const token = await bridge.kv.get<string>('aiRealtime.token');
  if (!token) return null;

  const url = (await bridge.kv.get<string>('aiRealtime.url')) || deviceConfig.aiRealtime.url;
  const topic = (await bridge.kv.get<string>('aiRealtime.topic')) || deviceConfig.aiRealtime.topic;
  const deviceId =
    (await bridge.kv.get<string>('realtime.pos_id')) || deviceConfig.appId;

  const next = new AiRealtimeClient({
    url,
    token,
    topic,
    deviceId,
    heartbeatMs: deviceConfig.aiRealtime.heartbeatMs,
  });

  // Session events: publish session.login / session.logout on user transitions.
  let previousUserId = useAuthStore.getState().user?.id ?? null;
  unsubscribeAuth = useAuthStore.subscribe((state) => {
    const userId = state.user?.id ?? null;
    if (userId === previousUserId) return;
    const at = new Date().toISOString();
    if (userId) {
      void next.publish(AI_REALTIME_EVENTS.sessionLogin, {
        deviceId: next.deviceId,
        userId,
        displayName: state.user?.display_name,
        role: state.user?.role,
        at,
      });
    } else if (previousUserId) {
      void next.publish(AI_REALTIME_EVENTS.sessionLogout, {
        deviceId: next.deviceId,
        userId: previousUserId,
        at,
      });
    }
    previousUserId = userId;
  });

  client = next;
  next.connect();
  return next;
}

export function stopAiRealtime(): void {
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  client?.disconnect();
  client = null;
}
