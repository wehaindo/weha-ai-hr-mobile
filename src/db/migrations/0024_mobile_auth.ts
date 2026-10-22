import type { Migration } from '../migrate';

// Mobile auth (login against weha-framework's /api/mobile/v1): stores the
// issued token pair for the current WEHA-account session. Single row — one
// mobile login per device — tokens at rest like integrations.device_token.
export const migration0024MobileAuth: Migration = {
  id: '0024_mobile_auth',
  up: (db) => {
    db.execute(`
      CREATE TABLE IF NOT EXISTS mobile_auth_sessions (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        tenant_slug TEXT,
        access_token TEXT,
        refresh_token TEXT NOT NULL,
        expires_at TEXT,
        identity_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
};
