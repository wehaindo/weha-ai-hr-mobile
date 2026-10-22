'use client';

import type { DeviceBridge } from '@/platform';
import { verifyPin, verifyPassword } from './crypto';
import type { SessionUser } from '@/stores/auth';
import {
  createMobileAuthClient,
  type MobileIdentity,
  type MobileLoginResult,
  type MobileSessionTokens,
} from '@/integration/mobile-auth/client';
import { getMobileTenantSlug, persistMobileTokens } from './mobile-session';
import { SYSTEM_ROLES } from './permissions';

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

// ---------------------------------------------------------------------------
// Mobile auth — sign in with a weha-framework account (PortalUser identity).
// Session-only: no local `users` row is created; permissions are fixed to the
// operator set at login time.
// ---------------------------------------------------------------------------

const MOBILE_SESSION_ROLE = 'operator';

function mobilePermissions(): string[] {
  const role = SYSTEM_ROLES.find((r) => r.id === MOBILE_SESSION_ROLE);
  return [...(role?.permissions ?? [])];
}

function mobileSessionUser(identity: MobileIdentity): SessionUser {
  const sub = identity.userId ?? identity.portalUserId ?? identity.employeeId ?? identity.email;
  return {
    id: `mobile:${sub}`,
    display_name: identity.name ?? identity.email,
    role: MOBILE_SESSION_ROLE,
    permissions: mobilePermissions(),
    authSource: 'mobile',
  };
}

async function completeMobileLogin(
  bridge: DeviceBridge,
  tokens: MobileSessionTokens,
  identity: MobileIdentity
): Promise<SessionUser> {
  await persistMobileTokens(bridge, tokens, {
    email: identity.email,
    tenant_slug: identity.tenantSlug,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: null,
    identity_json: JSON.stringify(identity),
  });
  return mobileSessionUser(identity);
}

/** Sign in with email + password against weha-framework `/api/mobile/v1/auth/login`. */
export async function authenticateWithMobile(
  bridge: DeviceBridge,
  email: string,
  password: string
): Promise<SessionUser> {
  const client = await createMobileAuthClient(bridge);
  const tenantSlug = await getMobileTenantSlug(bridge);
  const result: MobileLoginResult = await client.login(email.trim(), password, tenantSlug || undefined);
  return completeMobileLogin(bridge, result, result.user);
}

/** Sign in with a one-time email code (`/auth/otp/verify`). */
export async function authenticateWithMobileOtp(
  bridge: DeviceBridge,
  email: string,
  otp: string
): Promise<SessionUser> {
  const client = await createMobileAuthClient(bridge);
  const tenantSlug = await getMobileTenantSlug(bridge);
  const result: MobileLoginResult = await client.verifyOtp(email.trim(), otp, tenantSlug || undefined);
  return completeMobileLogin(bridge, result, result.user);
}

/** Request a login code. Returns `devCode` in non-production (echoed by the framework). */
export async function requestMobileLoginCode(
  bridge: DeviceBridge,
  email: string
): Promise<{ sent: true; devCode?: string }> {
  const client = await createMobileAuthClient(bridge);
  const tenantSlug = await getMobileTenantSlug(bridge);
  return client.requestOtp(email.trim(), tenantSlug || undefined);
}
