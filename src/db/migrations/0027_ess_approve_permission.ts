import type { Migration } from '../migrate';

// Grant the new `ess.approve` permission (approval inbox, Phase 4) to
// admin + manager + operator on databases seeded before it existed.
// Idempotent. The server remains the authority on who may approve what —
// this key only gates the ESS client's inbox route (non-approvers see an
// empty list). Mobile sessions inherit the operator set.
const NEW_PERMISSIONS = ['ess.approve'];
const GRANTED_ROLES = ['admin', 'manager', 'operator'];

export const migration0027EssApprovePermission: Migration = {
  id: '0027_ess_approve_permission',
  up: (db) => {
    const now = new Date().toISOString();

    for (const [id, name] of [
      ['admin', 'Administrator'],
      ['manager', 'Manager'],
      ['operator', 'Operator'],
    ] as const) {
      const exists = db.query<{ c: number }>('SELECT COUNT(*) AS c FROM roles WHERE id = ?', [id])[0]?.c ?? 0;
      if (exists === 0) {
        db.execute('INSERT INTO roles (id, name, is_system, created_at, updated_at) VALUES (?, ?, 1, ?, ?)', [id, name, now, now]);
      }
    }

    for (const roleId of GRANTED_ROLES) {
      for (const permissionId of NEW_PERMISSIONS) {
        const granted =
          db.query<{ c: number }>('SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = ? AND permission_id = ?', [roleId, permissionId])[0]?.c ?? 0;
        if (granted === 0) {
          db.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, permissionId]);
        }
      }
    }
  },
};
