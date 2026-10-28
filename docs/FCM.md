# Push notifications (FCM) for weha-device-framework

Step-by-step guide to enabling Firebase Cloud Messaging on the **web/PWA** and
**Capacitor** targets: acquire an FCM registration token on the device, show
foreground/background notifications, and register the token with the backend
(weha-framework) so a sender can target the device.

## How it works

```
[web/PWA]   Firebase JS SDK + /firebase-messaging-sw.js   ─┐
[Capacitor] @capacitor/push-notifications (native FCM)     ─┼─▶ FCM token
[Electron]  no Push API → falls back to local notify       ─┘     │
                                                                    ▼
                                            src/integration/push (manager)
                                            device_settings: push.enabled, push.fcmToken
                                                                    │ Bearer <device_token>
                                                                    ▼
                                 weha-framework  POST /api/device/fcm-token  →  Device.fcmToken
                                                                    │
                                 (future) FCM HTTP v1 sender  ◀──────┘
```

- The device app is a **pure static client** — it *receives* pushes and exposes
  its token, but it **cannot send**. Sending needs a backend holding the FCM
  server credentials (planned in weha-framework, see “Sender” below).
- Foreground messages are rendered locally via the existing `bridge.notify()`.
  Background messages are handled by the service worker (web) or the native
  plugin (Capacitor).
- The whole feature is opt-in: gated by the `push` module flag **and** the
  `push.enabled` device setting (Settings → Push).

## Platform support

| Target | Mechanism | Token acquisition |
|---|---|---|
| **web / PWA** | Firebase JS SDK + generated service worker | Full FCM token (needs HTTPS or localhost) |
| **cap-mobile / cap-tablet** | `@capacitor/push-notifications` | Full FCM token (via `google-services.json`) |
| **electron** | none — no Push API; `app://` is insecure when packaged | **Falls back to local notifications.** Experimental/dev only. |

> The `push` module flag is enabled on **all** targets (both `fullModules` and
> `minimalModules`), so the Settings → Push tab is always visible; Electron just
> reports “FCM unavailable” and uses local notify.

## Prerequisites

1. A **Firebase project** (console.firebase.google.com) with **Cloud Messaging**
   enabled.
2. **weha-device-framework** installed: `npm install` (also runs
   `scripts/gen-firebase-sw.mjs`).

## Step 1 — Web/PWA config

Add the Firebase web config to `.env` (all `NEXT_PUBLIC_*` — these are **public**,
not secrets; they ship in the bundle):

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...        # Project settings → Cloud Messaging → Web configuration
```

These are read by `device.config.ts` (`firebase` block) at build time.

**Service worker:** the static export copies `public/` verbatim, so the SW config
is baked in at build time by `scripts/gen-firebase-sw.mjs` (runs on
`postinstall`, `dev`, `build`, `electron:*`, `cap:sync*`). It writes
`public/firebase-messaging-sw.js` from the env above. Re-run it (`npm run gen:sw`)
after changing the Firebase env.

## Step 2 — Capacitor (native FCM)

1. **Install the plugin** (already in `package.json` after this change):
   `npm i @capacitor/push-notifications`.
2. **Download `google-services.json`** from the Firebase console
   (Project settings → Your apps → Android) and place it at
   **`android/app/google-services.json`**. The existing `android/app/build.gradle`
   already applies the `com.google.gms.google-services` plugin when that file
   exists (and logs “Push Notifications won't work” when it doesn't).
3. **Permissions / channel** are already wired in
   `android/app/src/main/AndroidManifest.xml`:
   - `POST_NOTIFICATIONS` (Android 13+ runtime permission),
   - default channel meta-data `high_importance_channel` (created at runtime by
     `src/platform/renderer-push.ts` when registering).
4. Build/sync as usual: `npm run cap:sync` (tablet) or `npm run cap:sync:mobile`.
5. iOS: add `GoogleService-Info.plist` + the Push Notifications capability in
   Xcode (APNs key is app-specific — not covered here).

## Step 3 — Backend token registration (weha-framework)

After a token is acquired, the device POSTs it to the backend using the device
Bearer token obtained at activation (`integrations.device_token`):

```
POST {NEXT_PUBLIC_ERP_BASE_URL}/api/device/fcm-token
Authorization: Bearer <device_token>
Content-Type: application/json

{ "token": "<fcm-token>", "platform": "web" | "capacitor" }
```

- Route: `app/api/device/fcm-token/route.ts` (device-authed; resolves the
  tenant `Device` row by `apiTokenId` and stores `Device.fcmToken`).
- Schema: `prisma/tenant/schema.prisma` → `Device.fcmToken` +
  `Device.fcmTokenUpdatedAt`. Apply with
  `npx prisma generate --config=prisma/tenant/prisma.config.ts --schema=prisma/tenant/schema.prisma`
  then run your tenant migration.
- If the device is **not activated** (no `device_token`), registration is
  skipped silently and retried on the next start.

## Step 4 — Enable on a device

1. Run `npm run dev` → `http://localhost:3180`.
2. Sign in → **Settings → Push**.
3. Toggle **Enable push** → grant the notification permission → an FCM token
   appears and the status badge shows `registered` (when the backend is reachable).

## Testing

- **Web background:** enable push, background the tab, send a test message from
  the Firebase console (Messaging → New campaign → test on device) → the service
  worker shows the notification.
- **Foreground:** with the app open, the message appears as a local notification
  via `bridge.notify()`.
- **Capacitor:** build (`npm run cap:sync*`) → install on device/emulator →
  enable push → token appears; send from the Firebase console.
- **Registration:** DevTools → Network → confirm `POST /api/device/fcm-token`
  with `Authorization: Bearer …` and a 2xx response; verify `Device.fcmToken` in
  the weha-framework DB.

## Sender (future work)

Sending is **not implemented**. When added, it lives in weha-framework as an FCM
HTTP v1 sender (e.g. `lib/notification/fcm-sender.ts` subscribed to the existing
event bus alongside `lib/notification/notification-handler.ts`), reading
`Device.fcmToken` per target device. Required env (already stubbed in
`.env.example`, currently unused):

```
FCM_PROJECT_ID=your-firebase-project-id
FCM_GOOGLE_APPLICATION_CREDENTIALS=./secrets/fcm-service-account.json
```

## Troubleshooting

- **“FCM unavailable” / no token on web** — Firebase env missing (`npm run gen:sw`
  warns), or not a secure context (must be HTTPS or localhost).
- **Placeholder service worker** — `gen-firebase-sw` logged “placeholder”; set the
  `NEXT_PUBLIC_FIREBASE_*` vars and rebuild.
- **Capacitor token null** — `google-services.json` missing from `android/app/`,
  or notification permission denied.
- **Registration badge `register failed`** — the backend rejected the call; check
  the device is activated and weha-framework is reachable at `erp.baseUrl`.
