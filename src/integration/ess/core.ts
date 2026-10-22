// Shared request core for the ESS API clients (profile + attendance):
// mobile-JWT authorization with a 5-minute skew and one forced
// refresh-retry on 401, `{success,data}` envelope unwrap, typed errors.
// Contracts: docs/ESS-API-CONTRACT.md, docs/ESS-ATTENDANCE-CONTRACT.md.
// The client NEVER sends an employee id — the backend resolves identity
// from the token (BRD §3/§6).

import deviceConfig from '@/device.config';
import type { DeviceBridge } from '@/platform';
import type { MobileAuthClient } from '@/integration/mobile-auth/client';
import {
  ensureFreshAccessToken,
  loadMobileSession,
  persistMobileTokens,
} from '@/auth/mobile-session';

export type EssApiErrorCode =
  | 'session_expired'
  | 'no_employee_session'
  | 'validation'
  | 'protected_field'
  | 'conflict'
  | 'no_employee'
  | 'rate_limited'
  | 'not_found'
  | 'unavailable';

export class EssApiError extends Error {
  readonly status: number;
  readonly code?: EssApiErrorCode;

  constructor(message: string, status: number, code?: EssApiErrorCode) {
    super(message);
    this.name = 'EssApiError';
    this.status = status;
    this.code = code;
  }

  /** true when the backend could not be reached (offline / DNS / CORS). */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isSessionExpired(): boolean {
    return this.code === 'session_expired';
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const ERROR_CODES = new Set<string>([
  'session_expired',
  'no_employee_session',
  'validation',
  'protected_field',
  'conflict',
  'no_employee',
  'rate_limited',
  'not_found',
  'unavailable',
]);

export function toApiError(status: number, error?: string, message?: string): EssApiError {
  const code = error && ERROR_CODES.has(error) ? (error as EssApiErrorCode) : undefined;
  if (status === 401) {
    return new EssApiError(message || 'Session expired. Please sign in again.', 401, 'session_expired');
  }
  if (status === 403 && code === 'no_employee') {
    return new EssApiError(message || 'No employee profile is linked to this account.', 403, 'no_employee');
  }
  if (status === 409) {
    return new EssApiError(message || 'That email is already used by another employee.', 409, 'conflict');
  }
  if (status === 429) {
    return new EssApiError(message || 'Too many attempts. Please wait a moment and try again.', 429, 'rate_limited');
  }
  if (status === 400) {
    return new EssApiError(message || 'The submitted values are invalid.', 400, 'validation');
  }
  if (status === 403 && code === 'protected_field') {
    return new EssApiError(message || 'That field cannot be changed by the employee.', 403, 'protected_field');
  }
  return new EssApiError(message || `Request failed (HTTP ${status})`, status, code);
}

export interface EssRequestOptions {
  /** Sent as the `Idempotency-Key` header (attendance submissions). */
  idempotencyKey?: string;
}

export interface EssCore {
  request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    opts?: EssRequestOptions
  ): Promise<T>;
}

/** Build the shared request pipeline bound to a bridge + mobile-auth client. */
export function createEssCore(bridge: DeviceBridge, mobile: MobileAuthClient): EssCore {
  const baseUrl = `${deviceConfig.erp.baseUrl.replace(/\/+$/, '')}/api/mobile/v1`;

  /** Refresh the token pair; true when a fresh token is available. */
  const tryRecoverSession = async (): Promise<boolean> => {
    try {
      const session = await loadMobileSession(bridge);
      if (!session?.refresh_token) return false;
      const tokens = await mobile.refresh(session.refresh_token);
      await persistMobileTokens(bridge, tokens, session, session.identity_json ?? undefined);
      return true;
    } catch {
      return false;
    }
  };

  const authorize = async (): Promise<void> => {
    const fresh = await ensureFreshAccessToken(bridge, mobile);
    if (fresh === 'unauthorized') {
      throw new EssApiError('Session expired. Please sign in again.', 401, 'session_expired');
    }
    if (fresh === 'none') {
      throw new EssApiError('No employee session on this device.', 401, 'no_employee_session');
    }
    // 'ok' | 'fresh' proceed; 'network' (refresh unreachable) falls through —
    // the request itself decides (offline-tolerant, never force-logout offline).
  };

  const request = async <T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    opts?: EssRequestOptions
  ): Promise<T> => {
    await authorize();

    const attempt = async (): Promise<T> => {
      const session = await loadMobileSession(bridge);
      if (!session?.access_token) {
        throw new EssApiError('No employee session on this device.', 401, 'no_employee_session');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };
      if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

      let res;
      try {
        res = await bridge.cloud.request({
          url: `${baseUrl}${path}`,
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          timeoutMs: 20000,
        });
      } catch {
        throw new EssApiError('Cannot reach the server. Check the connection and try again.', 0, 'unavailable');
      }

      const json = res.json as Envelope<T> | undefined;
      if (res.ok && json?.success && json.data !== undefined) return json.data;
      if (res.status === 0) {
        throw new EssApiError('Cannot reach the server. Check the connection and try again.', 0, 'unavailable');
      }
      throw toApiError(res.status, json?.error, json?.message);
    };

    try {
      return await attempt();
    } catch (err) {
      // One recovery attempt: a 401 can be caused by an offline-skewed
      // refresh — retry with a forced rotation before declaring expiry.
      if (err instanceof EssApiError && err.status === 401) {
        const recovered = await tryRecoverSession();
        if (recovered) return attempt();
      }
      throw err;
    }
  };

  return { request };
}
