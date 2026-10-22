// ESS API client — talks to the mobile API (`/api/mobile/v1/*`) through
// `bridge.cloud.request`, exactly like MobileAuthClient, but authenticated:
// the access token is refreshed with a 5-min skew and attached as a Bearer.
// Contract: docs/ESS-API-CONTRACT.md. The client NEVER sends an employee id —
// the backend resolves identity from the token (BRD §3/§6).

import { z } from 'zod';
import deviceConfig from '@/device.config';
import type { DeviceBridge } from '@/platform';
import { createMobileAuthClient, type MobileAuthClient } from '@/integration/mobile-auth/client';
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

// Unknown keys are stripped by zod — sensitive columns (salary, nik, npwp,
// bank…) can never reach component state even if a server leaks them.
export const essEmployeeSchema = z.object({
  id: z.string(),
  employeeNumber: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z.string().optional(),
  isActive: z.boolean().optional(),
  companyId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  avatarColor: z.string().nullable().optional(),
  company: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  department: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  manager: z
    .object({ id: z.string(), firstName: z.string().nullable(), lastName: z.string().nullable(), name: z.string().nullable() })
    .nullable()
    .optional(),
});

export type EssEmployee = z.infer<typeof essEmployeeSchema>;

/** Allowlisted profile fields (docs/ESS-API-CONTRACT.md §2.2). */
export const EDITABLE_PROFILE_FIELDS = ['email', 'phone'] as const;
export type EssProfilePatch = {
  email?: string;
  phone?: string;
};

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
  'unavailable',
]);

function toApiError(status: number, error?: string, message?: string): EssApiError {
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
  if (status === 400) {
    return new EssApiError(message || 'The submitted values are invalid.', 400, 'validation');
  }
  if (status === 403 && code === 'protected_field') {
    return new EssApiError(message || 'That field cannot be changed by the employee.', 403, 'protected_field');
  }
  return new EssApiError(message || `Request failed (HTTP ${status})`, status, code);
}

export class EssApiClient {
  private readonly bridge: DeviceBridge;
  private readonly mobile: MobileAuthClient;

  constructor(bridge: DeviceBridge, mobile: MobileAuthClient) {
    this.bridge = bridge;
    this.mobile = mobile;
  }

  /** GET /employees/me — the authorized profile (identity from token). */
  async getProfile(): Promise<EssEmployee> {
    const employee = await this.request<{ employee: unknown }>('GET', '/employees/me');
    return this.parse(employee.employee);
  }

  /**
   * PATCH /employees/me — only allowlisted, changed fields are ever sent;
   * no employee id travels with the request (server-resolved identity).
   */
  async updateProfile(patch: EssProfilePatch): Promise<EssEmployee> {
    const body: EssProfilePatch = {};
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.phone !== undefined) body.phone = patch.phone;
    if (Object.keys(body).length === 0) {
      throw new EssApiError('Nothing to update.', 400, 'validation');
    }
    const result = await this.request<{ employee: unknown }>('PATCH', '/employees/me', body);
    return this.parse(result.employee);
  }

  private parse(raw: unknown): EssEmployee {
    const parsed = essEmployeeSchema.safeParse(raw);
    if (!parsed.success) {
      // Contract drift between backend and client — fail loudly, render nothing.
      throw new EssApiError('Profile response did not match the API contract.', 500, 'unavailable');
    }
    return parsed.data;
  }

  private async request<T>(method: 'GET' | 'PATCH', path: string, body?: EssProfilePatch): Promise<T> {
    await this.authorize();

    const attempt = async (): Promise<T> => {
      const session = await loadMobileSession(this.bridge);
      if (!session?.access_token) {
        throw new EssApiError('No employee session on this device.', 401, 'no_employee_session');
      }

      let res;
      try {
        res = await this.bridge.cloud.request({
          url: `${deviceConfig.erp.baseUrl.replace(/\/+$/, '')}/api/mobile/v1${path}`,
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: body ? JSON.stringify(body) : undefined,
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
      // One recovery attempt: a 401 can be caused by an offline-skipped
      // refresh — retry with a forced rotation before declaring expiry.
      if (err instanceof EssApiError && err.status === 401) {
        const recovered = await this.tryRecoverSession();
        if (recovered) return attempt();
      }
      throw err;
    }
  }

  /** Refresh the token pair; true when a fresh token is available. */
  private async tryRecoverSession(): Promise<boolean> {
    try {
      const session = await loadMobileSession(this.bridge);
      if (!session?.refresh_token) return false;
      const tokens = await this.mobile.refresh(session.refresh_token);
      await persistMobileTokens(this.bridge, tokens, session, session.identity_json ?? undefined);
      return true;
    } catch {
      return false;
    }
  }

  private async authorize(): Promise<void> {
    const fresh = await ensureFreshAccessToken(this.bridge, this.mobile);
    if (fresh === 'unauthorized') {
      throw new EssApiError('Session expired. Please sign in again.', 401, 'session_expired');
    }
    if (fresh === 'none') {
      throw new EssApiError('No employee session on this device.', 401, 'no_employee_session');
    }
    // 'ok' | 'fresh' proceed; 'network' (refresh unreachable) falls through —
    // the request itself decides (offline-tolerant, never force-logout offline).
  }
}

/** Factory: ESS client bound to the device bridge (web / Capacitor / Electron). */
export async function createEssApiClient(bridge: DeviceBridge): Promise<EssApiClient> {
  const mobile = await createMobileAuthClient(bridge);
  return new EssApiClient(bridge, mobile);
}
