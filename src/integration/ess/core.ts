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
  /** Domain failure code from the envelope (e.g. `overlap`, `status_conflict`). */
  readonly domainCode?: string;

  constructor(message: string, status: number, code?: EssApiErrorCode, domainCode?: string) {
    super(message);
    this.name = 'EssApiError';
    this.status = status;
    this.code = code;
    this.domainCode = domainCode;
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
  // Any non-transport `error` value is a domain code (overlap, status_conflict…)
  // — preserved so callers can branch on it.
  const domainCode = error && !code ? error : undefined;
  if (status === 401) {
    return new EssApiError(message || 'Session expired. Please sign in again.', 401, 'session_expired');
  }
  if (status === 403 && code === 'no_employee') {
    return new EssApiError(message || 'No employee profile is linked to this account.', 403, 'no_employee');
  }
  if (status === 409) {
    return new EssApiError(message || 'That request conflicts with the current state.', 409, 'conflict', domainCode);
  }
  if (status === 429) {
    return new EssApiError(message || 'Too many attempts. Please wait a moment and try again.', 429, 'rate_limited');
  }
  if (status === 400) {
    return new EssApiError(message || 'The submitted values are invalid.', 400, 'validation', domainCode);
  }
  if (status === 403 && code === 'protected_field') {
    return new EssApiError(message || 'That field cannot be changed by the employee.', 403, 'protected_field');
  }
  return new EssApiError(message || `Request failed (HTTP ${status})`, status, code, domainCode);
}

export interface EssRequestOptions {
  /** Sent as the `Idempotency-Key` header (attendance/request submissions). */
  idempotencyKey?: string;
}

/** One file part of a multipart submit (contract ESS-REQUESTS §4.1). */
export interface EssFilePart {
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface EssCore {
  request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    opts?: EssRequestOptions
  ): Promise<T>;
  /**
   * Multipart POST: the JSON payload goes in a `request` form field and the
   * files in `files[]` parts — the single submit shape the requests API
   * expects (Content-Type boundary is left to the platform).
   */
  uploadJson<T>(path: string, json: unknown, files: EssFilePart[], opts?: EssRequestOptions): Promise<T>;
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

  interface SendSpec {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    jsonBody?: unknown;
    formData?: Array<{ name: string; value?: string; filename?: string; bytes?: Uint8Array; contentType?: string }>;
    idempotencyKey?: string;
  }

  const send = async <T>(spec: SendSpec): Promise<T> => {
    await authorize();

    const attempt = async (): Promise<T> => {
      const session = await loadMobileSession(bridge);
      if (!session?.access_token) {
        throw new EssApiError('No employee session on this device.', 401, 'no_employee_session');
      }

      const headers: Record<string, string> = { Authorization: `Bearer ${session.access_token}` };
      if (!spec.formData) headers['Content-Type'] = 'application/json'; // multipart sets its own boundary
      if (spec.idempotencyKey) headers['Idempotency-Key'] = spec.idempotencyKey;

      let res;
      try {
        res = await bridge.cloud.request({
          url: `${baseUrl}${spec.path}`,
          method: spec.method,
          headers,
          body: spec.formData ? undefined : spec.jsonBody !== undefined ? JSON.stringify(spec.jsonBody) : undefined,
          formData: spec.formData,
          timeoutMs: spec.formData ? 60000 : 20000,
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

  return {
    request: <T>(method: SendSpec['method'], path: string, body?: unknown, opts?: EssRequestOptions) =>
      send<T>({ method, path, jsonBody: body, idempotencyKey: opts?.idempotencyKey }),
    uploadJson: <T>(path: string, json: unknown, files: EssFilePart[], opts?: EssRequestOptions) =>
      send<T>({
        method: 'POST',
        path,
        formData: [
          { name: 'request', value: JSON.stringify(json) },
          ...files.map((f) => ({ name: 'files', filename: f.filename, bytes: f.bytes, contentType: f.contentType })),
        ],
        idempotencyKey: opts?.idempotencyKey,
      }),
  };
}
