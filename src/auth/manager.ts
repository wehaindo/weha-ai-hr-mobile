'use client';

// Central auth registry — one definition of "how to authenticate as X".
//
// Every integration that talks to a backend needs a credential, but today each
// client reads its own store and hand-rolls its own header. This module is the
// single accessor: a named AuthProvider resolves a token from wherever it is
// stored, and consumers call getToken/authorize/authRequest instead of touching
// the store themselves.
//
// Storage is NOT moved here — tokens stay in `integrations`, `datahub_configs`,
// `mobile_auth_sessions`, config tables, etc. The manager only defines *how to
// read and attach* them. New apps/services register their own provider with
// registerAuthProvider(name, provider); built-ins below can be overridden by
// registering the same name after import.

import type { CloudRequest, CloudResponse, DeviceBridge } from '@/platform';
import { ensureFreshAccessToken, loadMobileSession } from './mobile-session';
import { createMobileAuthClient } from '@/integration/mobile-auth/client';

/** Resolves a credential for a named provider. */
export interface AuthProvider {
  /** Current token, or null when unavailable (not activated / not configured). */
  getToken(bridge: DeviceBridge): Promise<string | null>;
  /** How to attach the token to headers. Defaults to `Authorization: Bearer <token>`. */
  apply?(headers: Record<string, string>, token: string): void;
}

export type AuthUnavailableReason = 'missing-provider' | 'no-token';

/** Thrown by authorize()/authRequest() when a credential cannot be resolved. */
export class AuthUnavailableError extends Error {
  constructor(
    public readonly provider: string,
    public readonly reason: AuthUnavailableReason
  ) {
    super(`Auth "${provider}" unavailable (${reason})`);
    this.name = 'AuthUnavailableError';
  }
}

const providers = new Map<string, AuthProvider>();

function defaultApply(headers: Record<string, string>, token: string): void {
  headers.Authorization = `Bearer ${token}`;
}

// ---------------------------------------------------------------- registry

/** Register (or override) a named provider. Built-ins are registered at module load. */
export function registerAuthProvider(name: string, provider: AuthProvider): void {
  providers.set(name, provider);
}

export function unregisterAuthProvider(name: string): void {
  providers.delete(name);
}

export function hasAuthProvider(name: string): boolean {
  return providers.has(name);
}

export function listAuthProviders(): string[] {
  return [...providers.keys()];
}

/** Clear the registry and re-register the built-ins (test isolation). */
export function resetAuthProviders(): void {
  providers.clear();
  registerBuiltins();
}

// ---------------------------------------------------------------- consumers

/**
 * Resolve a token, or null when the provider is missing or has no credential.
 * Errors thrown by a provider's resolver propagate (so bugs surface rather than
 * being mistaken for "not configured").
 */
export async function getToken(bridge: DeviceBridge, name: string): Promise<string | null> {
  const provider = providers.get(name);
  if (!provider) return null;
  return (await provider.getToken(bridge)) ?? null;
}

/**
 * Return a copy of `headers` with the provider's credential attached.
 * Throws AuthUnavailableError when the provider is not registered or resolves
 * to no token — callers that can degrade gracefully should use getToken().
 */
export async function authorize(
  bridge: DeviceBridge,
  name: string,
  headers: Record<string, string> = {}
): Promise<Record<string, string>> {
  const provider = providers.get(name);
  if (!provider) throw new AuthUnavailableError(name, 'missing-provider');
  const token = (await provider.getToken(bridge)) ?? null;
  if (!token) throw new AuthUnavailableError(name, 'no-token');
  const out = { ...headers };
  (provider.apply ?? defaultApply)(out, token);
  return out;
}

/** `authorize` + `bridge.cloud.request` in one call. */
export async function authRequest(
  bridge: DeviceBridge,
  name: string,
  req: CloudRequest
): Promise<CloudResponse> {
  const headers = await authorize(bridge, name, req.headers);
  return bridge.cloud.request({ ...req, headers });
}

/** The activated device credentials — device auth is a token + tenant pair. */
export interface DeviceAuth {
  token: string;
  tenantId: string;
}

/**
 * Resolve the device token (via the `device` provider) together with the tenant
 * the device is bound to (from the integration config). Returns null when the
 * device is not activated. `tenantId` is '' only if the config lacks it — the
 * backend derives the tenant from the token in that case.
 */
export async function getDeviceAuth(bridge: DeviceBridge): Promise<DeviceAuth | null> {
  const token = await getToken(bridge, 'device');
  if (!token) return null;

  let tenantId = '';
  try {
    const rows = await bridge.db.query<{ config: string | null }>(
      "SELECT config FROM integrations WHERE kind = 'erp' LIMIT 1"
    );
    const cfg = rows[0]?.config ? (JSON.parse(rows[0].config) as Record<string, string>) : {};
    tenantId = cfg.tenantSlug || cfg.tenantId || '';
  } catch {
    /* malformed config — the token alone still authenticates (tenant is bound to it) */
  }
  return { token, tenantId };
}

// ---------------------------------------------------------------- built-ins

const BUILTINS: Record<string, AuthProvider> = {
  // ERP device token minted at activation (integrations.device_token).
  device: {
    async getToken(bridge) {
      const rows = await bridge.db.query<{ device_token: string | null }>(
        "SELECT device_token FROM integrations WHERE kind = 'erp' LIMIT 1"
      );
      return rows[0]?.device_token ?? null;
    },
  },

  // Data Hub enrollment token (datahub_configs.device_token).
  datahub: {
    async getToken(bridge) {
      const rows = await bridge.db.query<{ device_token: string | null }>(
        'SELECT device_token FROM datahub_configs ORDER BY created_at ASC LIMIT 1'
      );
      return rows[0]?.device_token ?? null;
    },
  },

  // Mobile user session access token (mobile_auth_sessions), refreshed on demand.
  // Baked in for consumers that need the signed-in user's token; login/bootstrap
  // still drive the refresh themselves.
  mobile: {
    async getToken(bridge) {
      const status = await ensureFreshAccessToken(bridge, await createMobileAuthClient(bridge));
      if (status === 'none' || status === 'unauthorized') return null;
      const session = await loadMobileSession(bridge);
      return session?.access_token ?? null;
    },
  },
};

function registerBuiltins(): void {
  for (const [name, provider] of Object.entries(BUILTINS)) providers.set(name, provider);
}

registerBuiltins();
