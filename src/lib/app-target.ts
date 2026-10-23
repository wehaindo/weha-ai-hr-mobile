// Build-time app target — decides which feature profile the bundle ships with.
// Set via NEXT_PUBLIC_APP_TARGET (inlined by Next at build time); the package.json
// scripts set it per platform. Unknown/missing values fall back to 'web'.

export const APP_TARGETS = ['web', 'electron', 'cap-mobile', 'cap-tablet'] as const;

export type AppTarget = (typeof APP_TARGETS)[number];

const raw = process.env.NEXT_PUBLIC_APP_TARGET;

export const APP_TARGET: AppTarget =
  (APP_TARGETS as readonly string[]).includes(raw ?? '') ? (raw as AppTarget) : 'web';

/** Electron and tablet Capacitor ship the full feature set; web and phones get the lean one. */
export const isFullTarget = APP_TARGET === 'electron' || APP_TARGET === 'cap-tablet';
