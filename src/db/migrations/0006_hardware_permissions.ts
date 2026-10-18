import type { Migration } from '../migrate';

// Grant the new hardware.manage permission to admin (all) and manager roles on
// databases seeded before this permission existed. Idempotent: safe to re-run.
export const migration0006HardwarePermissions: Migration = {
  id: '0006_hardware_permissions',
  up: (db) => {
    const now = new Date().toISOString();

    // Ensure the roles exist (fresh DBs already have them from 0004_seed).
    for (const [id, name] of [
      ['admin', 'Administrator'],
      ['manager', 'Manager'],
    ] as const) {
      const exists = db.query<{ c: number }>('SELECT COUNT(*) AS c FROM roles WHERE id = ?', [id])[0]?.c ?? 0;
      if (exists === 0) {
        db.execute('INSERT INTO roles (id, name, is_system, created_at, updated_at) VALUES (?, ?, 1, ?, ?)', [
          id,
          name,
          now,
          now,
        ]);
      }
    }

    // Grant hardware.manage to admin + manager if not already granted.
    for (const roleId of ['admin', 'manager']) {
      const granted =
        db.query<{ c: number }>('SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = ? AND permission_id = ?', [
          roleId,
          'hardware.manage',
        ])[0]?.c ?? 0;
      if (granted === 0) {
        db.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, 'hardware.manage']);
      }
    }
  },
};
