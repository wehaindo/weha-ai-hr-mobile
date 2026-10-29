'use client';

// Local storage for the mobile-auth token pair (weha-framework session).
// One row (id 'current') in `mobile_auth_sessions`; the zustand session holds
// the identity, this holds the tokens so boot can refresh them.

import type { DeviceBridge } from '@/platform';
import { MobileAuthClient, MobileAuthError, type MobileSessionTokens } from '@/integration/mobile-auth/client';

export const MOBILE_TENANT_SLUG_KEY = 'auth.mobileTenantSlug';
const SESSION_ROW_ID = 'current';
/** Refresh when the access token expires within this window. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface StoredMobileSession {
  email: string;
  tenant_slug: string | null;
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
  identity_json: string | null;
}

interface SessionRow extends StoredMobileSession {
  id: string;
}

/** Tenant slug for mobile login (empty → framework uses its single-tenant default). */
export async function getMobileTenantSlug(bridge: DeviceBridge): Promise<string> {
  try {
    return (await bridge.kv.get<string>(MOBILE_TENANT_SLUG_KEY))?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function loadMobileSession(bridge: DeviceBridge): Promise<StoredMobileSession | null> {
  const rows = await bridge.db.query<SessionRow>(
    `SELECT email, tenant_slug, access_token, refresh_token, expires_at, identity_json
     FROM mobile_auth_sessions WHERE id = ?`,
    [SESSION_ROW_ID]
  );
  return rows[0] ?? null;
}

export async function saveMobileSession(
  bridge: DeviceBridge,
  session: StoredMobileSession
): Promise<void> {
  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO mobile_auth_sessions (id, email, tenant_slug, access_token, refresh_token, expires_at, identity_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       tenant_slug = excluded.tenant_slug,
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       identity_json = excluded.identity_json,
       updated_at = excluded.updated_at`,
    [
      SESSION_ROW_ID,
      session.email,
      session.tenant_slug,
      session.access_token,
      session.refresh_token,
      session.expires_at,
      session.identity_json,
      now,
      now,
    ]
  );
  // Session writes are auth-critical: a reload right after login must see the
  // row, so bypass the engine's save debounce and make it durable now.
  await bridge.db.flush();
}

export async function clearMobileSession(bridge: DeviceBridge): Promise<void> {
  await bridge.db.execute('DELETE FROM mobile_auth_sessions WHERE id = ?', [SESSION_ROW_ID]);
  await bridge.db.flush();
}

/** Store a freshly issued token pair from any login/verify/refresh response. */
export async function persistMobileTokens(
  bridge: DeviceBridge,
  tokens: MobileSessionTokens,
  previous?: StoredMobileSession,
  identityJson?: string
): Promise<StoredMobileSession> {
  const session: StoredMobileSession = {
    email: previous?.email ?? '',
    tenant_slug: previous?.tenant_slug ?? null,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    identity_json: identityJson ?? previous?.identity_json ?? null,
  };
  await saveMobileSession(bridge, session);
  return session;
}

export type EnsureFreshResult =
  | 'ok' // access token still valid
  | 'fresh' // rotated and persisted
  | 'none' // no stored row (e.g. a not-yet-flushed write after reload) — keep the session
  | 'network' // framework unreachable — keep the session (offline-tolerant)
  | 'unauthorized'; // refresh token revoked/expired — caller should log out

/**
 * Rotate the access token when it is (nearly) expired. Distinguishes an
 * unreachable framework (keep session) from a revoked refresh token (log out).
 * A missing row is NOT treated as revocation: DB writes are debounced, so a
 * reload right after login can race the flush — the zustand session stays.
 */
export async function ensureFreshAccessToken(
  bridge: DeviceBridge,
  client: MobileAuthClient
): Promise<EnsureFreshResult> {
  const session = await loadMobileSession(bridge);
  if (!session) return 'none';

  const expiresAt = session.expires_at ? Date.parse(session.expires_at) : Number.NaN;
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return 'ok';
  }

  try {
    const tokens = await client.refresh(session.refresh_token);
    await persistMobileTokens(bridge, tokens, session);
    return 'fresh';
  } catch (err) {
    if (err instanceof MobileAuthError && (err.status === 401 || err.status === 403)) {
      return 'unauthorized';
    }
    return 'network';
  }
}
