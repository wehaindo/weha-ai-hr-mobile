import type { Migration } from '../migrate';
import bcrypt from 'bcryptjs';

// Username + password login (optional, alongside the existing PIN login). Adds
// `username` (unique) and `password_hash` to `users`, and gives the seeded admin
// a default username/password so password login works out of the box. Both
// columns are nullable — users without them keep signing in with a PIN only.

type Db = Parameters<Migration['up']>[0];

function hasColumn(db: Db, table: string, column: string): boolean {
  return db.query<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column);
}

export const migration0020UserCredentials: Migration = {
  id: '0020_user_credentials',
  up: (db) => {
    if (!hasColumn(db, 'users', 'username')) {
      db.execute('ALTER TABLE users ADD COLUMN username TEXT');
    }
    if (!hasColumn(db, 'users', 'password_hash')) {
      db.execute('ALTER TABLE users ADD COLUMN password_hash TEXT');
    }
    db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

    // Seed the admin's credentials (idempotent: only when unset). Default
    // username `admin` / password `admin123` — change it in Settings → Users.
    const admin = db.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'admin' AND username IS NULL ORDER BY created_at ASC LIMIT 1"
    )[0];
    if (admin) {
      db.execute('UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?', [
        'admin',
        bcrypt.hashSync('admin123', 10),
        new Date().toISOString(),
        admin.id,
      ]);
    }
  },
};
