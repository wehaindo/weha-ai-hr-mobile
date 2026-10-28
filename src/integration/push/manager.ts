// Push orchestration: acquire an FCM token via the bridge, persist it in
// device_settings, register it with the backend, and surface foreground
// messages as local notifications. Opt-in via the `push.enabled` KV flag — when
// off (default), startPush does nothing. A null token (unsupported platform or
// denied permission) is not an error; the app falls back to local notify().

import type { DeviceBridge, PushMessage, PushPermission } from '@/platform';
import { useNotifications } from '@/stores/notifications';
import { registerFcmToken } from './register';

export interface PushStatus {
  enabled: boolean;
  supported: boolean;
  permission: PushPermission;
  token: string | null;
  registeredAt: string | null;
  /** Last backend registration outcome, for display in settings. */
  lastRegister?: { registered: boolean; attempted: boolean; message?: string };
}

const KEY_ENABLED = 'push.enabled';
const KEY_TOKEN = 'push.fcmToken';
const KEY_REGISTERED_AT = 'push.registeredAt';

let unsubscribeMessages: (() => void) | null = null;
let lastRegister: PushStatus['lastRegister'];
let started = false;

/** Opt-in check: push runs only when `push.enabled` is true. */
export async function isPushEnabled(bridge: DeviceBridge): Promise<boolean> {
  return (await bridge.kv.get<boolean>(KEY_ENABLED)) === true;
}

/**
 * Start push for this device: request permission, get an FCM token, persist it,
 * register it with the backend, and wire foreground messages to local notify.
 * No-op when push is disabled. Returns the resulting status.
 */
export async function startPush(bridge: DeviceBridge): Promise<PushStatus> {
  if (!(await isPushEnabled(bridge))) {
    return getStatus(bridge, { supported: await bridge.push.isSupported() });
  }

  const supported = await bridge.push.isSupported();
  if (!supported) {
    return getStatus(bridge, { supported: false });
  }

  // Request permission (no-op / already-granted on repeat).
  await bridge.push.requestPermission();
  const token = await bridge.push.getToken();

  if (token) {
    await bridge.kv.set(KEY_TOKEN, token);
    await bridge.kv.set(KEY_REGISTERED_AT, new Date().toISOString());
    lastRegister = await registerFcmToken(bridge, token);
  }

  // Wire foreground messages → local notification + in-app bell (idempotent).
  if (!unsubscribeMessages) {
    unsubscribeMessages = bridge.push.onMessage((message) => {
      useNotifications.getState().add(message);
      void bridge.notify(message.title ?? 'Notification', message.body ?? '');
    });
  }
  started = true;

  return getStatus(bridge, { supported: true, token: token ?? undefined });
}

/** Stop push: unsubscribe foreground messages (token is kept for re-enable). */
export function stopPush(): void {
  unsubscribeMessages?.();
  unsubscribeMessages = null;
  started = false;
}

/** Current push status for the settings UI. */
export async function getStatus(
  bridge: DeviceBridge,
  override?: { supported?: boolean; token?: string }
): Promise<PushStatus> {
  const supported = override?.supported ?? (await bridge.push.isSupported());
  const permission = await bridge.push.getPermission();
  const token = override?.token ?? (await bridge.kv.get<string>(KEY_TOKEN));
  const registeredAt = await bridge.kv.get<string>(KEY_REGISTERED_AT);
  return {
    enabled: await isPushEnabled(bridge),
    supported,
    permission,
    token: token ?? null,
    registeredAt: registeredAt ?? null,
    lastRegister,
  };
}

/** Whether foreground messaging is currently wired up. */
export function isRunning(): boolean {
  return started;
}

export type { PushMessage };
