import bcrypt from 'bcryptjs';
import type { Migration } from '../migrate';
import { generateId } from '../../lib/id';

// Demo/dummy account so the app is immediately login-able (handy for web/PWA,
// where there may be no enrollment or real users yet). It gets BOTH a username
// + password (username login) and a PIN (PIN grid), and the `operator` role.
// Idempotent: only inserted when no user with username `demo` exists. Delete or
// edit it in Settings → Users before shipping.

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo123';
const DEMO_PIN = '0000';

export const migration0028SeedDemoUser: Migration = {
  id: '0028_seed_demo_user',
  up: (db) => {
    const existing = db.query<{ id: string }>('SELECT id FROM users WHERE username = ?', [DEMO_USERNAME]);
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    db.execute(
      `INSERT INTO users (id, display_name, pin_hash, role, avatar_color, is_active, created_at, updated_at, username, password_hash)
       VALUES (?, ?, ?, 'operator', ?, 1, ?, ?, ?, ?)`,
      [
        generateId(),
        'Demo User',
        bcrypt.hashSync(DEMO_PIN, 10),
        'oklch(0.707 0.165 254.62)',
        now,
        now,
        DEMO_USERNAME,
        bcrypt.hashSync(DEMO_PASSWORD, 10),
      ]
    );
  },
};
