import type { Migration } from '../migrate';

// How an integration row authenticates its outbound calls:
//   'api_key' — the original path: arbitrary base_url + endpoint + api_key.
//   'device'  — the activated device auth (Bearer deviceToken + ?tenantId=)
//               against the framework's external API `/api/device/{configCode}`
//               (endpoint holds the configCode for this kind).
// Existing rows default to 'api_key' so current behavior is unchanged. No CHECK
// here (SQLite ADD COLUMN constraint limits) — values are validated in the service.
export const migration0027IntegrationAuthType: Migration = {
  id: '0027_integration_auth_type',
  up: (db) => {
    db.execute(`ALTER TABLE integration_entities ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'api_key'`);
  },
};
