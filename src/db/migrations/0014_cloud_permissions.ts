import type { Migration } from '../migrate';

// Grant the new cloud.manage permission to admin + manager on databases seeded
// before it existed. Idempotent: safe to re-run.
const PERMISSION = 'cloud.manage';
const GRANTED_ROLES = ['admin', 'manager'];

export const migration0014CloudPermissions: Migration = {
  id: '0014_cloud_permissions',
  up: (db) => {
    const now = new Date().toISOString();

    for (const [id, name] of [
      ['admin', 'Administrator'],
      ['manager', 'Manager'],
    ] as const) {
      const exists = db.query<{ c: number }>('SELECT COUNT(*) AS c FROM roles WHERE id = ?', [id])[0]?.c ?? 0;
      if (exists === 0) {
        db.execute('INSERT INTO roles (id, name, is_system, created_at, updated_at) VALUES (?, ?, 1, ?, ?)', [id, name, now, now]);
      }
    }

    for (const roleId of GRANTED_ROLES) {
      const granted =
        db.query<{ c: number }>('SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = ? AND permission_id = ?', [roleId, PERMISSION])[0]?.c ?? 0;
      if (granted === 0) {
        db.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, PERMISSION]);
      }
    }
  },
};
