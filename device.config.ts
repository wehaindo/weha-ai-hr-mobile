// Single source of truth for app identity + feature profile.
// Imported by the Next.js app (client-safe: keep it a static object, NO secrets),
// by electron (compiled via tsc) and by capacitor.config.ts.
// Run `npm run init-app` to rewrite this for a new device app.
//
// The feature set is chosen at BUILD time by NEXT_PUBLIC_APP_TARGET (see
// src/lib/app-target.ts): electron and cap-tablet get the full profile,
// web/pwa and cap-mobile (phone) get the minimal one.

import { APP_TARGET, isFullTarget } from './src/lib/app-target';

// Full profile: Electron desktop and Capacitor tablets.
const fullModules = {
  sync: true,
  print: true,
  hardware: true,
  onScreenKeyboard: true,
  integration: true,
  datahub: true,
  ecr: true,
  realtime: true,
  aiRealtime: true,
  cloud: true,
  google: true,
  grist: true,
  supabase: true,
  security: true,
  backup: true,
  retention: true,
  aiVoice: true,
  testing: true,
  push: true,
};

// TS enforces the minimal profile covers every module key.
type ModuleFlags = { [K in keyof typeof fullModules]: boolean };

// Minimal profile: web/pwa and phone Capacitor — sync, device enrollment and
// auth only; no printing, hardware, cloud targets or dev tooling.
const minimalModules: ModuleFlags = {
  sync: true,
  print: false,
  hardware: false,
  onScreenKeyboard: false,
  integration: false,
  datahub: true,
  ecr: false,
  realtime: false,
  aiRealtime: false,
  cloud: false,
  google: false,
  grist: false,
  supabase: false,
  security: true,
  backup: false,
  retention: true,
  aiVoice: false,
  testing: false,
  push: true,
};

const deviceConfig = {
  // Identity
  appName: 'Device Framework',
  appId: 'com.weha.deviceframework',
  version: '1.0.0',

  // Build target this bundle was produced for ('web' when the env was unset)
  target: APP_TARGET,

  // Dev server port (must match the port in package.json scripts)
  port: 3180,

  // Branding
  brand: {
    primary: 'oklch(0.769 0.188 70.08)', // amber
    sidebarTitle: 'WEHA Device',
    logo: '', // optional path under /public
  },

  // WEHA ERP sync (DeviceClient)
  erp: {
    baseUrl: process.env.NEXT_PUBLIC_ERP_BASE_URL ?? 'https://erp.example.com',
    enabled: true,
    pollIntervalMs: 15000,
  },

  // WEHA AI Realtime (Socket.IO gateway) — see docs/AI-REALTIME.md.
  // The credential (whrt_ token) is NOT stored here; it lives per-device in
  // device_settings under the key `aiRealtime.token`.
  aiRealtime: {
    url: process.env.NEXT_PUBLIC_AI_REALTIME_URL ?? 'http://localhost:4002',
    topic: 'tenant:default:device.events',
    heartbeatMs: 60000,
  },

  // Firebase Cloud Messaging (public web config — NOT secrets; safe in the bundle).
  // Used to acquire an FCM registration token on web/PWA. Capacitor uses
  // google-services.json instead; the server-side sender config lives in the backend.
  // See docs/FCM.md.
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    /** Web Push VAPID key (Cloud Messaging → Web configuration). */
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '',
  },

  // Database file name (Electron stores it under app.getPath('userData'))
  dbName: 'device.db',
  // Feature switches for framework modules, resolved from the build target.
  modules: isFullTarget ? fullModules : minimalModules,
};

export type DeviceConfig = typeof deviceConfig;
export type ModuleKey = keyof ModuleFlags;

export default deviceConfig;
