'use client';

import type { DeviceBridge } from '@/platform';
import { verifyPin, verifyPassword } from './crypto';
import type { SessionUser } from '@/stores/auth';

export interface LoginUser {
  id: string;
  display_name: string;
  role: string;
  avatar_color?: string;
}

interface UserRow {
  id: string;
  display_name: string;
  pin_hash: string;
  username?: string | null;
  password_hash?: string | null;
  role: string;
  avatar_color: string | null;
  is_active: number;
}

export async function fetchActiveUsers(bridge: DeviceBridge): Promise<LoginUser[]> {
  const rows = await bridge.db.query<UserRow>(
    `SELECT id, display_name, role, avatar_color, pin_hash, is_active
     FROM users WHERE is_active = 1 ORDER BY display_name`
  );
  return rows.map(({ id, display_name, role, avatar_color }) => ({
    id,
    display_name,
    role,
    avatar_color: avatar_color ?? undefined,
  }));
}

export async function fetchPermissions(bridge: DeviceBridge, role: string): Promise<string[]> {
  const rows = await bridge.db.query<{ permission_id: string }>(
    'SELECT permission_id FROM role_permissions WHERE role_id = ?',
    [role]
  );
  return rows.map((r) => r.permission_id);
}

export async function authenticate(
  bridge: DeviceBridge,
  userId: string,
  pin: string
): Promise<SessionUser> {
  const rows = await bridge.db.query<UserRow>(
    'SELECT id, display_name, role, avatar_color, pin_hash, is_active FROM users WHERE id = ?',
    [userId]
  );
  const user = rows[0];
  if (!user || user.is_active !== 1) {
    throw new Error('User not found or inactive');
  }

  const valid = await verifyPin(pin, user.pin_hash);
  if (!valid) {
    throw new Error('Incorrect PIN');
  }

  await bridge.db.execute('UPDATE users SET last_login_at = ? WHERE id = ?', [
    new Date().toISOString(),
    userId,
  ]);

  const permissions = await fetchPermissions(bridge, user.role);
  return {
    id: user.id,
    display_name: user.display_name,
    role: user.role,
    avatar_color: user.avatar_color ?? undefined,
    permissions,
  };
}

/** Sign in with a username + password (optional alternative to PIN login). */
export async function authenticateWithCredentials(
  bridge: DeviceBridge,
  username: string,
  password: string
): Promise<SessionUser> {
  const rows = await bridge.db.query<UserRow>(
    'SELECT id, display_name, role, avatar_color, password_hash, is_active FROM users WHERE username = ?',
    [username]
  );
  const user = rows[0];
  if (!user || user.is_active !== 1) {
    throw new Error('Unknown username');
  }
  if (!user.password_hash) {
    throw new Error('No password set for this user');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new Error('Incorrect password');
  }

  await bridge.db.execute('UPDATE users SET last_login_at = ? WHERE id = ?', [
    new Date().toISOString(),
    user.id,
  ]);

  const permissions = await fetchPermissions(bridge, user.role);
  return {
    id: user.id,
    display_name: user.display_name,
    role: user.role,
    avatar_color: user.avatar_color ?? undefined,
    permissions,
  };
}
