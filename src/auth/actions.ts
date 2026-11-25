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
import { getMobileTenantSlug, persistMobileTokens, MOBILE_TENANT_SLUG_KEY } from './mobile-session';
import { SYSTEM_ROLES, mapRole } from './permissions';

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
  const users: LoginUser[] = rows.map(({ id, display_name, role, avatar_color }) => ({
    id,
    display_name,
    role,
    avatar_color: avatar_color ?? undefined,
  }));

  // Synced employees that have a device PIN set are also PIN-login-able offline.
  const empRows = await bridge.db.query<{ id: string; name: string; role: string | null }>(
    `SELECT id, name, role FROM employees
     WHERE device_pin_hash IS NOT NULL AND COALESCE(is_active, 1) != 0
     ORDER BY name`
  );
  const employees: LoginUser[] = empRows.map((e) => ({
    id: e.id,
    display_name: e.name,
    role: mapRole(e.role),
    avatar_color: undefined,
  }));

  return [...users, ...employees].sort((a, b) => a.display_name.localeCompare(b.display_name));
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
  if (!user) {
    // Not a local user — fall back to a synced employee (employees.device_pin_hash).
    return authenticateEmployeePin(bridge, userId, pin);
  }
  if (user.is_active !== 1) {
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

/** PIN sign-in against a synced employee (employees.device_pin_hash), verified offline. */
async function authenticateEmployeePin(
  bridge: DeviceBridge,
  employeeId: string,
  pin: string
): Promise<SessionUser> {
  const rows = await bridge.db.query<{
    id: string;
    name: string;
    role: string | null;
    is_active: number;
    device_pin_hash: string | null;
  }>('SELECT id, name, role, is_active, device_pin_hash FROM employees WHERE id = ?', [employeeId]);
  const emp = rows[0];
  if (!emp || emp.is_active === 0) {
    throw new Error('User not found or inactive');
  }
  if (!emp.device_pin_hash) {
    throw new Error('This account has no PIN set');
  }
  const valid = await verifyPin(pin, emp.device_pin_hash);
  if (!valid) {
    throw new Error('Incorrect PIN');
  }

  const role = mapRole(emp.role);
  const permissions = await fetchPermissions(bridge, role);
  return { id: emp.id, display_name: emp.name, role, permissions };
}

/** Sign in with a username + password (optional alternative to PIN login). */
export async function authenticateWithCredentials(
  bridge: DeviceBridge,
  username: string,
  password: string
): Promise<SessionUser> {
  // Portal account (email) — the primary source for password login (synced from
  // the framework). Returns null when the credential isn't a portal account.
  const portal = await authenticatePortalUser(bridge, username, password);
  if (portal) return portal;

  // Local device user (username) — fallback (device admin / fixtures).
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

/**
 * Password sign-in against a synced portal account (portal_users), verified offline.
 * Returns null when the credential is not a portal account (so the caller can fall
 * back to a local user); throws when it IS a portal account but the credentials
 * are wrong. Email matches case-insensitively (portal emails are).
 */
async function authenticatePortalUser(
  bridge: DeviceBridge,
  email: string,
  password: string
): Promise<SessionUser | null> {
  const rows = await bridge.db.query<{
    id: string;
    email: string;
    name: string;
    employee_id: string | null;
    is_active: number;
    password_hash: string | null;
  }>('SELECT id, email, name, employee_id, is_active, password_hash FROM portal_users WHERE LOWER(email) = LOWER(?)', [
    email,
  ]);
  const pu = rows[0];
  if (!pu) return null; // not a portal account → caller falls back to a local user
  if (pu.is_active === 0) {
    throw new Error('Unknown username');
  }
  if (!pu.password_hash) {
    throw new Error('No password set for this user');
  }
  const valid = await verifyPassword(password, pu.password_hash);
  if (!valid) {
    throw new Error('Incorrect password');
  }

  const role = await resolveEmployeeRole(bridge, pu.employee_id);
  const permissions = await fetchPermissions(bridge, role);
  return { id: pu.id, display_name: pu.name, role, permissions };
}

/** Role for a portal account: its linked employee's role, mapped to a built-in role (default operator). */
async function resolveEmployeeRole(bridge: DeviceBridge, employeeId: string | null): Promise<string> {
  if (!employeeId) return 'operator';
  const rows = await bridge.db.query<{ role: string | null }>('SELECT role FROM employees WHERE id = ?', [employeeId]);
  return mapRole(rows[0]?.role);
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

/** Sign in with email + password against the mobile `/api/mobile/v1/auth/login`. */
export async function authenticateWithMobile(
  bridge: DeviceBridge,
  email: string,
  password: string,
  tenantSlugOverride?: string
): Promise<SessionUser> {
  const client = await createMobileAuthClient(bridge);
  const tenantSlug = await resolveTenantSlug(bridge, tenantSlugOverride);
  const result: MobileLoginResult = await client.login(email.trim(), password, tenantSlug || undefined);
  await persistUsedTenantSlug(bridge, tenantSlug);
  return completeMobileLogin(bridge, result, result.user);
}

/** Sign in with a one-time email code (`/auth/otp/verify`). */
export async function authenticateWithMobileOtp(
  bridge: DeviceBridge,
  email: string,
  otp: string,
  tenantSlugOverride?: string
): Promise<SessionUser> {
  const client = await createMobileAuthClient(bridge);
  const tenantSlug = await resolveTenantSlug(bridge, tenantSlugOverride);
  const result: MobileLoginResult = await client.verifyOtp(email.trim(), otp, tenantSlug || undefined);
  await persistUsedTenantSlug(bridge, tenantSlug);
  return completeMobileLogin(bridge, result, result.user);
}

/** Request a login code. Returns `devCode` in non-production (echoed by the framework). */
export async function requestMobileLoginCode(
  bridge: DeviceBridge,
  email: string,
  tenantSlugOverride?: string
): Promise<{ sent: true; devCode?: string }> {
  const client = await createMobileAuthClient(bridge);
  const tenantSlug = await resolveTenantSlug(bridge, tenantSlugOverride);
  return client.requestOtp(email.trim(), tenantSlug || undefined);
}

/** Login-screen tenant field wins; otherwise the slug saved in Settings. */
async function resolveTenantSlug(bridge: DeviceBridge, override?: string): Promise<string> {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  return getMobileTenantSlug(bridge);
}

/** Remember the slug that actually worked so OTP/refresh reuse it. */
async function persistUsedTenantSlug(bridge: DeviceBridge, tenantSlug: string): Promise<void> {
  if (!tenantSlug) return;
  try {
    await bridge.kv.set(MOBILE_TENANT_SLUG_KEY, tenantSlug);
  } catch {
    /* remembering is best-effort */
  }
}
