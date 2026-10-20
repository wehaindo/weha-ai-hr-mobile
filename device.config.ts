// Single source of truth for app identity.
// Imported by the Next.js app (client-safe: keep it a static object, NO secrets),
// by electron (compiled via tsc) and by capacitor.config.ts.
// Run `npm run init-app` to rewrite this for a new device app.

const deviceConfig = {
  // Identity
  appName: 'Device Framework',
  appId: 'com.weha.deviceframework',
  version: '1.0.0',

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

  // Database file name (Electron stores it under app.getPath('userData'))
  dbName: 'device.db',

  // Feature switches for framework modules
  modules: {
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
  },
};

export type DeviceConfig = typeof deviceConfig;

export default deviceConfig;
