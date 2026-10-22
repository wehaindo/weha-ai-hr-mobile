import type { Migration } from '../migrate';

export const migration0002Permissions: Migration = {
  id: '0002_permissions',
  up: (db) => {
    db.execute(`
      CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.execute(`
      CREATE TABLE role_permissions (
        role_id TEXT NOT NULL,
        permission_id TEXT NOT NULL,
        PRIMARY KEY (role_id, permission_id)
      )
    `);
  },
};
