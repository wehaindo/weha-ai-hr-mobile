// Cloud HTTP + Google OAuth for the main process — the main-process half of the
// DeviceBridge `cloud` capability. HTTP runs here to avoid renderer CORS; Google
// OAuth opens a window and captures the redirect code via a localhost server.

import * as http from 'http';
import { BrowserWindow } from 'electron';

export interface CloudRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  formData?: Array<{ name: string; filename?: string; bytes?: Uint8Array; contentType?: string; value?: string }>;
  timeoutMs?: number;
}

export interface CloudResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: any;
}

const DEFAULT_TIMEOUT_MS = 30000;

/** Build a FormData body from multipart parts (e.g. Whisper audio upload). */
function buildFormData(parts: NonNullable<CloudRequest['formData']>): FormData {
  const form = new FormData();
  for (const part of parts) {
    if (part.bytes) {
      form.append(part.name, new Blob([Buffer.from(part.bytes)], { type: part.contentType ?? 'application/octet-stream' }), part.filename ?? 'file');
    } else {
      form.append(part.name, part.value ?? '');
    }
  }
  return form;
}

/** Perform an HTTP request from the main process (no CORS). */
export async function cloudRequest(req: CloudRequest): Promise<CloudResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const init: RequestInit = {
      method: req.method ?? 'GET',
      headers: req.headers,
      signal: controller.signal,
    };
    if (req.formData) {
      // Multipart: let fetch set the boundary (drop any content-type header).
      const headers = { ...(req.headers ?? {}) };
      delete headers['Content-Type'];
      delete headers['content-type'];
      init.headers = headers;
      init.body = buildFormData(req.formData);
    } else {
      init.body = req.body;
    }

    const res = await fetch(req.url, init);
    const body = await res.text();

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let json: unknown;
    const contentType = headers['content-type'] ?? '';
    if (contentType.includes('json') && body) {
      try {
        json = JSON.parse(body);
      } catch {
        /* leave json undefined for non-JSON */
      }
    }

    return { ok: res.ok, status: res.status, headers, body, json };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Google OAuth authorization-code flow: open a window to the authorize URL and
 * capture the redirect `?code=` via a localhost callback server. Exchanges the
 * code for tokens at Google's token endpoint. Electron-only.
 */
export async function googleOAuth(
  authorizeUrl: string,
  options?: { port?: number; timeoutMs?: number; clientId?: string; clientSecret?: string }
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; token_type?: string }> {
  const port = options?.port ?? 9090;
  const timeoutMs = options?.timeoutMs ?? 120000;

  const code = await captureRedirectCode(authorizeUrl, port, timeoutMs);

  // Exchange the code for tokens (server-to-server, no CORS).
  const clientId = options?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = options?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '';
  const redirectUri = `http://localhost:${port}/callback`;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenRes = await cloudRequest({
    url: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenRes.ok || !tokenRes.json?.access_token) {
    throw new Error(tokenRes.json?.error_description ?? `Token exchange failed (HTTP ${tokenRes.status})`);
  }

  return tokenRes.json;
}

/** Open a window to the authorize URL; resolve with the `code` query param. */
function captureRedirectCode(authorizeUrl: string, port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let server: http.Server | null = null;
    let win: BrowserWindow | null = null;

    const finish = (err?: Error, code?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        server?.close();
      } catch {
        /* ignore */
      }
      try {
        if (win && !win.isDestroyed()) win.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(code!);
    };

    const timer = setTimeout(() => finish(new Error('OAuth flow timed out')), timeoutMs);

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Authorization denied</h1>');
        finish(new Error(`OAuth error: ${error}`));
        return;
      }
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Authorized. You can close this window.</h1>');
      finish(undefined, code ?? undefined);
    });

    server.on('error', (err) => finish(err));
    server.listen(port, () => {
      win = new BrowserWindow({ width: 600, height: 800, webPreferences: { nodeIntegration: false } });
      win.loadURL(authorizeUrl);
      win.on('closed', () => finish(new Error('OAuth window closed before completion')));
    });
  });
}
