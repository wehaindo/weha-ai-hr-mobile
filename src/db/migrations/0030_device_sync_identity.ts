import type { Migration } from '../migrate';

// Device-sync identity tables — the local store for the framework's EMPLOYEES /
// PORTAL_USERS device-sync configs (backend: `npm run seed:device-sync`). The
// device pulls them read-only via `GET /api/device/{EMPLOYEES|PORTAL_USERS}`.
//
// Columns mirror those configs' `responseMapping` (allowlist) in snake_case.
// Everything except id/timestamps is nullable so a partial response never fails
// the write; `created_at`/`updated_at` are owned by the write path (appended),
// which is why the backend's `updatedAt` is intentionally not a mapped column.
export const migration0030DeviceSyncIdentity: Migration = {
  id: '0030_device_sync_identity',
  up: (db) => {
    db.execute(`
      CREATE TABLE employees (
        id TEXT PRIMARY KEY,
        employee_id TEXT,
        first_name TEXT,
        last_name TEXT,
        name TEXT,
        email TEXT,
        phone TEXT,
        position TEXT,
        status TEXT,
        is_active INTEGER,
        role TEXT,
        department TEXT,
        device_pin_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_employees_employee_id ON employees(employee_id)`);

    db.execute(`
      CREATE TABLE portal_users (
        id TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        phone TEXT,
        employee_id TEXT,
        is_active INTEGER,
        first_name TEXT,
        last_name TEXT,
        position TEXT,
        password_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_portal_users_email ON portal_users(email)`);
  },
};
