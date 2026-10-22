// Mobile auth client for weha-framework's /api/mobile/v1 endpoints
// (login / OTP / refresh / logout). Runs in the renderer through
// `bridge.cloud.request` so Electron dodges CORS, like the cloud clients.
//
// Envelope: success → { success: true, data }, failure → { success: false,
// error, message? }. `error` carries a message, except login 403s where it is
// a code (`setup_required` / `otp_required`).

import deviceConfig from '@/device.config';
import type { DeviceBridge } from '@/platform';

export interface MobileSessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface MobileIdentity {
  userId: string | null;
  employeeId: string | null;
  portalUserId: string | null;
  email: string;
  name: string | null;
  tenantSlug: string;
}

export interface MobileLoginResult extends MobileSessionTokens {
  user: MobileIdentity;
}

export interface MobileOtpRequestResult {
  sent: true;
  devCode?: string;
}

export type MobileAuthErrorCode = 'setup_required' | 'otp_required';

export class MobileAuthError extends Error {
  status: number;
  code?: MobileAuthErrorCode;

  constructor(message: string, status: number, code?: MobileAuthErrorCode) {
    super(message);
    this.name = 'MobileAuthError';
    this.status = status;
    this.code = code;
  }

  /** true when the device could not reach the framework (offline / DNS / CORS). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

const API_BASE = '/api/mobile/v1';
const SETUP_CODES: MobileAuthErrorCode[] = ['setup_required', 'otp_required'];

export class MobileAuthClient {
  private bridge: DeviceBridge;
  private baseUrl: string;
  private deviceName?: string;

  constructor(bridge: DeviceBridge, baseUrl: string, deviceName?: string) {
    this.bridge = bridge;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.deviceName = deviceName;
  }

  async login(email: string, password: string, tenantSlug?: string): Promise<MobileLoginResult> {
    return this.post<MobileLoginResult>('/auth/login', { tenantSlug, email, password });
  }

  async requestOtp(email: string, tenantSlug?: string): Promise<MobileOtpRequestResult> {
    return this.post<MobileOtpRequestResult>('/auth/otp/request', { tenantSlug, email });
  }

  async verifyOtp(email: string, otp: string, tenantSlug?: string): Promise<MobileLoginResult> {
    return this.post<MobileLoginResult>('/auth/otp/verify', { tenantSlug, email, otp });
  }

  async refresh(refreshToken: string): Promise<MobileSessionTokens> {
    return this.post<MobileSessionTokens>('/auth/refresh', { refreshToken });
  }

  /** Revokes the refresh session server-side. Idempotent — callers may ignore failures. */
  async logout(refreshToken: string): Promise<{ revoked: boolean }> {
    return this.post<{ revoked: boolean }>('/auth/logout', { refreshToken });
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.deviceName) headers['x-device-name'] = this.deviceName;

    let res;
    try {
      res = await this.bridge.cloud.request({
        url: `${this.baseUrl}${API_BASE}${path}`,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeoutMs: 20000,
      });
    } catch {
      throw new MobileAuthError('Cannot reach the server. Check the connection and try again.', 0);
    }

    const json = res.json as
      | { success?: boolean; data?: unknown; error?: string; message?: string }
      | undefined;

    if (res.ok && json?.success && json.data !== undefined) {
      return json.data as T;
    }

    const rawError = json?.error ?? '';
    const status = res.status;
    if ((status === 401 || status === 403) && SETUP_CODES.includes(rawError as MobileAuthErrorCode)) {
      throw new MobileAuthError(json?.message ?? rawError, status, rawError as MobileAuthErrorCode);
    }
    if (status === 401) {
      throw new MobileAuthError(rawError || 'Invalid email or password', 401);
    }
    if (status === 403) {
      throw new MobileAuthError(json?.message ?? (rawError || 'Access denied'), 403);
    }
    if (status === 0) {
      throw new MobileAuthError('Cannot reach the server. Check the connection and try again.', 0);
    }
    throw new MobileAuthError(rawError || json?.message || `Request failed (HTTP ${status})`, status);
  }
}

/** Build a client from device config + the stored device name (sent as x-device-name). */
export async function createMobileAuthClient(bridge: DeviceBridge): Promise<MobileAuthClient> {
  let deviceName: string | undefined;
  try {
    deviceName = (await bridge.kv.get<string>('device.name')) ?? undefined;
  } catch {
    /* device name is cosmetic — omit the header if unavailable */
  }
  return new MobileAuthClient(bridge, deviceConfig.erp.baseUrl, deviceName);
}
