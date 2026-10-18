// Google Sheets client — wraps the Sheets/Drive/OAuth APIs, routing every call
// through the DeviceBridge `cloud.request` (main process on Electron, avoiding
// CORS). Handles token refresh + append + auto-create-spreadsheet fallback.
// Ported from ai-pos src/lib/google/client.ts, adapted to the bridge.

import type { DeviceBridge } from '@/platform';

const GOOGLE_API_BASE = 'https://www.googleapis.com';
const GOOGLE_OAUTH_BASE = 'https://accounts.google.com';
export const GOOGLE_SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly';

export interface GoogleAccountTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  token_expiry?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
}

export interface GoogleSheetInfo {
  spreadsheetId: string;
  title: string;
  sheets?: Array<{ sheetId: string; title: string; index: number }>;
}

/** Build the Google OAuth authorization URL. */
export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SHEETS_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_OAUTH_BASE}/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange an authorization code for tokens via cloud.request. */
export async function exchangeCode(
  bridge: DeviceBridge,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await bridge.cloud.request({
    url: `${GOOGLE_OAUTH_BASE}/o/oauth2/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok || !res.json?.access_token) {
    throw new Error(res.json?.error_description ?? `Token exchange failed (HTTP ${res.status})`);
  }
  return res.json;
}

/** Refresh an access token via cloud.request. */
export async function refreshAccessToken(
  bridge: DeviceBridge,
  tokens: GoogleAccountTokens
): Promise<{ access_token: string; expires_in?: number }> {
  if (!tokens.refresh_token) throw new Error('No refresh token available');
  const body = new URLSearchParams({
    client_id: tokens.client_id ?? '',
    client_secret: tokens.client_secret ?? '',
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await bridge.cloud.request({
    url: `${GOOGLE_OAUTH_BASE}/o/oauth2/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok || !res.json?.access_token) {
    throw new Error(res.json?.error_description ?? `Token refresh failed (HTTP ${res.status})`);
  }
  return res.json;
}

/** Whether the stored token is expired (with a 1-minute buffer). */
export function isTokenExpired(tokens: GoogleAccountTokens): boolean {
  if (!tokens.token_expiry) return true;
  return Date.now() >= new Date(tokens.token_expiry).getTime() - 60000;
}

/**
 * Google API client bound to a bridge + token supplier. Token refresh is the
 * caller's responsibility (the config service persists the new token).
 */
export class GoogleClient {
  constructor(
    private bridge: DeviceBridge,
    private tokens: GoogleAccountTokens
  ) {}

  private authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.tokens.access_token}` };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.bridge.cloud.request({
      url: path,
      method: (init?.method as CloudMethod) ?? 'GET',
      headers: { ...this.authHeader(), ...(init?.headers as Record<string, string> | undefined) },
      body: init?.body as string | undefined,
    });
    if (!res.ok) {
      const message = res.json?.error?.message ?? `Google request failed (${res.status})`;
      throw new Error(message);
    }
    return res.json as T;
  }

  async getUserInfo(): Promise<{ email?: string; sub?: string }> {
    return this.request('https://www.googleapis.com/oauth2/v2/userinfo');
  }

  async getSpreadsheet(spreadsheetId: string): Promise<GoogleSheetInfo> {
    return this.request<GoogleSheetInfo>(
      `${GOOGLE_API_BASE}/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,title,sheets(sheetId,title,index)`
    );
  }

  async listSpreadsheets(): Promise<Array<{ id: string; title: string }>> {
    const response = await this.request<{ files: Array<{ id: string; name: string }> }>(
      `${GOOGLE_API_BASE}/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)&orderBy=name`
    );
    return (response.files ?? []).map((f) => ({ id: f.id, title: f.name }));
  }

  async createSpreadsheet(title: string): Promise<GoogleSheetInfo> {
    return this.request<GoogleSheetInfo>(`${GOOGLE_API_BASE}/v4/spreadsheets`, {
      method: 'POST',
      body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: 'Order Lines' } }] }),
    });
  }

  async appendRows(
    spreadsheetId: string,
    range: string,
    values: unknown[][]
  ): Promise<{ updatedRange: string; updatedRows: number }> {
    const res = await this.request<{ updates?: { updatedRange?: string; updatedRows?: number } }>(
      `${GOOGLE_API_BASE}/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
      { method: 'POST', body: JSON.stringify({ values }) }
    );
    return { updatedRange: res.updates?.updatedRange ?? '', updatedRows: res.updates?.updatedRows ?? 0 };
  }

  async updateCells(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
    await this.request(
      `${GOOGLE_API_BASE}/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify({ values }) }
    );
  }
}

type CloudMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
