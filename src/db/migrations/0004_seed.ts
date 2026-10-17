import bcrypt from 'bcryptjs';
import type { Migration } from '../migrate';
import { SYSTEM_ROLES } from '../../auth/permissions';
import { generateId } from '../../lib/id';

const DEFAULT_ADMIN_PIN = '1234';

export const migration0004Seed: Migration = {
  id: '0004_seed',
  up: (db) => {
    const now = new Date().toISOString();

    // System roles + permissions (only when the roles table is empty)
    const roleCount = db.query<{ c: number }>('SELECT COUNT(*) AS c FROM roles')[0]?.c ?? 0;
    if (roleCount === 0) {
      for (const role of SYSTEM_ROLES) {
        db.execute('INSERT INTO roles (id, name, is_system, created_at, updated_at) VALUES (?, ?, 1, ?, ?)', [
          role.id,
          role.name,
          now,
          now,
        ]);
        for (const permission of role.permissions) {
          db.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [role.id, permission]);
        }
      }
    }

    // Default admin user (PIN 1234) — only when no users exist. Change it after first login.
    const userCount = db.query<{ c: number }>('SELECT COUNT(*) AS c FROM users')[0]?.c ?? 0;
    if (userCount === 0) {
      db.execute(
        `INSERT INTO users (id, display_name, pin_hash, role, avatar_color, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', ?, 1, ?, ?)`,
        [generateId(), 'Administrator', bcrypt.hashSync(DEFAULT_ADMIN_PIN, 10), 'oklch(0.769 0.188 70.08)', now, now]
      );
    }

    // Device settings defaults
    const defaults: Record<string, string> = {
      'device.name': db.query<{ value: string }>("SELECT value FROM device_settings WHERE key = 'device.name'")[0]?.value ?? '',
      'device.activated': 'false',
      'sync.last_run_at': '',
    };
    for (const [key, value] of Object.entries(defaults)) {
      const existing = db.query<{ key: string }>('SELECT key FROM device_settings WHERE key = ?', [key]);
      if (existing.length === 0) {
        db.execute('INSERT INTO device_settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now]);
      }
    }
  },
};
