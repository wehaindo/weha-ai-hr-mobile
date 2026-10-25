// Renderer push capability for web + Capacitor (loaded by renderer-bridge).
// - web: Firebase JS SDK + the generated /firebase-messaging-sw.js service worker.
// - capacitor: @capacitor/push-notifications native plugin (real FCM via google-services.json).
// Everything degrades gracefully: unsupported / unconfigured / denied → null or
// 'unsupported', never a throw, so the app can fall back to local notify().

import type { PushMessage, PushPermission } from './bridge';
import deviceConfig from '../../device.config';

const firebaseConfig = deviceConfig.firebase;

/** True when the web Firebase project config is present (api key + project id). */
export function isWebFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

// ---------------------------------------------------------------------------
// Web (PWA) — Firebase JS SDK + service worker
// ---------------------------------------------------------------------------

type WebMessaging = import('firebase/messaging').Messaging;

let webMessaging: WebMessaging | null = null;
let webMessagingInit = false;
const webMessageListeners = new Set<(m: PushMessage) => void>();

/** Register the generated Firebase messaging service worker (web only). */
async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  } catch {
    return null;
  }
}

/** Lazily initialize the Firebase web messaging instance. Null when unconfigured. */
async function getWebMessaging(): Promise<WebMessaging | null> {
  if (webMessagingInit) return webMessaging;
  webMessagingInit = true;
  if (!isWebFirebaseConfigured()) return null;
  try {
    const [{ initializeApp, getApps }, messaging] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    webMessaging = messaging.getMessaging(app);
    // Forward foreground messages to listeners (guarded — isSupported can fail).
    if (await messaging.isSupported()) {
      messaging.onMessage(webMessaging, (payload) => {
        const message: PushMessage = {
          title: payload.notification?.title,
          body: payload.notification?.body,
          data: (payload.data as Record<string, string>) ?? undefined,
        };
        for (const listener of webMessageListeners) listener(message);
      });
    } else {
      webMessaging = null;
    }
  } catch {
    webMessaging = null;
  }
  return webMessaging;
}

async function webPermission(): Promise<PushPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

async function webGetToken(): Promise<string | null> {
  const messaging = await getWebMessaging();
  if (!messaging) return null;
  try {
    const { getToken } = await import('firebase/messaging');
    const registration = await registerMessagingServiceWorker();
    return await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey || undefined,
      serviceWorkerRegistration: registration ?? undefined,
    });
  } catch {
    return null;
  }
}

async function webUnregister(): Promise<string | null> {
  // There is no cross-browser "delete token" that is fully reliable; deleting
  // via the SDK is best-effort and we always clear local state upstream.
  try {
    const messaging = await getWebMessaging();
    if (messaging) {
      const { deleteToken } = await import('firebase/messaging');
      await deleteToken(messaging);
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Capacitor — @capacitor/push-notifications native plugin
// ---------------------------------------------------------------------------

type PushNotificationsPlugin = typeof import('@capacitor/push-notifications').PushNotifications;

let capacitorListenersBound = false;

async function getCapacitorPlugin(): Promise<PushNotificationsPlugin | null> {
  try {
    const mod = await import('@capacitor/push-notifications');
    return mod.PushNotifications ?? null;
  } catch {
    return null;
  }
}

/** Bind native listeners once; they forward into the shared listener set. */
async function bindCapacitorListeners(plugin: PushNotificationsPlugin): Promise<void> {
  if (capacitorListenersBound) return;
  capacitorListenersBound = true;
  try {
    await plugin.addListener('pushNotificationReceived', (notification) => {
      const message: PushMessage = {
        title: notification.title,
        body: notification.body,
        data: (notification.data as Record<string, string>) ?? undefined,
      };
      for (const listener of webMessageListeners) listener(message);
    });
    // Tap/action events: surface the payload too (title/body from data if set).
    await plugin.addListener('pushNotificationActionPerformed', (notification) => {
      const data = (notification.notification?.data ?? {}) as Record<string, string>;
      const message: PushMessage = {
        title: notification.notification?.title ?? data.title,
        body: notification.notification?.body ?? data.body,
        data,
      };
      for (const listener of webMessageListeners) listener(message);
    });
  } catch {
    capacitorListenersBound = false;
  }
}

async function capacitorPermission(): Promise<PushPermission> {
  const plugin = await getCapacitorPlugin();
  if (!plugin) return 'unsupported';
  try {
    const result = await plugin.checkPermissions();
    return mapCapacitorPermission(result.receive);
  } catch {
    return 'unsupported';
  }
}

async function capacitorRequestPermission(): Promise<PushPermission> {
  const plugin = await getCapacitorPlugin();
  if (!plugin) return 'unsupported';
  try {
    const result = await plugin.requestPermissions();
    return mapCapacitorPermission(result.receive);
  } catch {
    return 'unsupported';
  }
}

/** Capacitor PermissionState → NotificationPermission ('prompt' ≈ 'default'). */
function mapCapacitorPermission(state: string): PushPermission {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  if (state === 'prompt' || state === 'prompt-with-rationale') return 'default';
  return 'unsupported';
}

/** Create the default high-importance channel (Android 8+; FCM needs it to show background notifications). */
async function ensureCapacitorChannel(plugin: PushNotificationsPlugin): Promise<void> {
  try {
    await plugin.createChannel({
      id: 'high_importance_channel',
      name: 'General',
      description: 'General notifications',
      importance: 4,
      visibility: 1,
    });
  } catch {
    /* channel may already exist or be unsupported */
  }
}

async function capacitorGetToken(): Promise<string | null> {
  const plugin = await getCapacitorPlugin();
  if (!plugin) return null;
  try {
    await bindCapacitorListeners(plugin);
    await ensureCapacitorChannel(plugin);
    await plugin.register();
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (value: string | null) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      // Registration resolves with the token; error/timeout → null.
      plugin
        .addListener('registration', (token) => done(token?.value ?? null))
        .catch(() => done(null));
      plugin.addListener('registrationError', () => done(null)).catch(() => done(null));
      setTimeout(() => done(null), 15000);
    });
  } catch {
    return null;
  }
}

async function capacitorUnregister(): Promise<void> {
  const plugin = await getCapacitorPlugin();
  if (!plugin) return;
  try {
    // Deletes the native FCM/APNS token and drops our listeners.
    await plugin.unregister();
    await plugin.removeAllListeners();
    capacitorListenersBound = false;
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Public factory — chosen by the bridge's platform kind
// ---------------------------------------------------------------------------

export interface RendererPushCapability {
  isSupported(): Promise<boolean>;
  getPermission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  getToken(): Promise<string | null>;
  onMessage(listener: (message: PushMessage) => void): () => void;
  unregister(): Promise<void>;
}

export function createRendererPush(platform: 'web' | 'capacitor'): RendererPushCapability {
  const isCapacitor = platform === 'capacitor';

  return {
    async isSupported(): Promise<boolean> {
      if (isCapacitor) return (await getCapacitorPlugin()) !== null;
      // Web needs a secure context + the Firebase config present.
      if (typeof window === 'undefined') return false;
      const secure = window.isSecureContext ?? false;
      return secure && isWebFirebaseConfigured();
    },
    getPermission: () => (isCapacitor ? capacitorPermission() : webPermission()),
    requestPermission: () =>
      isCapacitor ? capacitorRequestPermission() : (async () => {
        if (typeof Notification === 'undefined') return 'unsupported';
        const result = await Notification.requestPermission();
        return result;
      })(),
    getToken: () => (isCapacitor ? capacitorGetToken() : webGetToken()),
    onMessage(listener) {
      webMessageListeners.add(listener);
      return () => webMessageListeners.delete(listener);
    },
    async unregister(): Promise<void> {
      if (isCapacitor) {
        await capacitorUnregister();
      } else {
        await webUnregister();
      }
    },
  };
}
