// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import {
  authenticateWithMobile,
  authenticateWithMobileOtp,
  requestMobileLoginCode,
} from '@/auth/actions';
import {
  clearMobileSession,
  ensureFreshAccessToken,
  loadMobileSession,
  saveMobileSession,
} from '@/auth/mobile-session';
import { MobileAuthClient, type MobileAuthError } from '@/integration/mobile-auth/client';
import { SYSTEM_ROLES } from '@/auth/permissions';
import type { DeviceBridge } from '@/platform';

type RequestMock = ReturnType<typeof vi.fn>;

const IDENTITY = {
  userId: 'u1',
  employeeId: 'e1',
  portalUserId: 'p1',
  email: 'budi@example.com',
  name: 'Budi Santoso',
  tenantSlug: 'default',
};

const TOKENS = {
  accessToken: 'access-1',
  refreshToken: 'tenantid01.abc123',
  tokenType: 'Bearer',
  expiresIn: 900,
};

function ok(data: unknown) {
  return { ok: true, status: 200, headers: {}, body: '', json: { success: true, data } };
}

function fail(status: number, error: string, message?: string) {
  return { ok: false, status, headers: {}, body: '', json: { success: false, error, message } };
}

async function makeBridge(request?: RequestMock) {
  const handle = await createFakeBridge();
  if (request) {
    handle.bridge.cloud.request = request as unknown as DeviceBridge['cloud']['request'];
  }
  return handle;
}

function makeClient(bridge: DeviceBridge): MobileAuthClient {
  return new MobileAuthClient(bridge, 'http://framework.test');
}

describe('mobile auth', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('authenticateWithMobile persists tokens and returns a session-only user', async () => {
    const request = vi.fn(async () => ok({ ...TOKENS, user: IDENTITY }));
    const { bridge } = await makeBridge(request);

    const session = await authenticateWithMobile(bridge, 'budi@example.com', 'secret1');

    expect(session.authSource).toBe('mobile');
    expect(session.id).toBe('mobile:u1');
    expect(session.display_name).toBe('Budi Santoso');
    expect(session.role).toBe('operator');
    expect(session.permissions).toEqual(SYSTEM_ROLES.find((r) => r.id === 'operator')!.permissions);

    const row = await loadMobileSession(bridge);
    expect(row).not.toBeNull();
    expect(row!.email).toBe('budi@example.com');
    expect(row!.refresh_token).toBe(TOKENS.refreshToken);
    expect(row!.access_token).toBe(TOKENS.accessToken);
    expect(Date.parse(row!.expires_at!)).toBeGreaterThan(Date.now());
    expect(JSON.parse(row!.identity_json!).email).toBe('budi@example.com');

    // session-only: no local user row is created
    const users = await bridge.db.query<{ id: string }>('SELECT id FROM users');
    expect(users.every((u) => u.id !== 'mobile:u1')).toBe(true);
  });

  it('maps 403 setup_required / otp_required to coded errors without storing a session', async () => {
    const request = vi.fn(async () =>
      fail(403, 'setup_required', 'No mobile account exists for this email.')
    );
    const { bridge } = await makeBridge(request);

    const err = await authenticateWithMobile(bridge, 'x@example.com', 'pw').catch((e: unknown) => e) as MobileAuthError;
    expect(err.code).toBe('setup_required');
    expect(err.status).toBe(403);
    expect(err.message).toBe('No mobile account exists for this email.');
    expect(await loadMobileSession(bridge)).toBeNull();

    const request2 = vi.fn(async () => fail(403, 'otp_required', 'This account has no mobile password.'));
    const { bridge: bridge2 } = await makeBridge(request2);
    const err2 = await authenticateWithMobile(bridge2, 'x@example.com', 'pw').catch((e: unknown) => e) as MobileAuthError;
    expect(err2.code).toBe('otp_required');
    expect(await loadMobileSession(bridge2)).toBeNull();
  });

  it('rejects invalid credentials with the server message', async () => {
    const request = vi.fn(async () => fail(401, 'Invalid email or password'));
    const { bridge } = await makeBridge(request);

    await expect(authenticateWithMobile(bridge, 'x@example.com', 'bad')).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('surfaces unreachable-framework failures as a network error (status 0)', async () => {
    const request = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const { bridge } = await makeBridge(request);

    const err = await authenticateWithMobile(bridge, 'x@example.com', 'pw').catch((e: unknown) => e) as MobileAuthError;
    expect(err.isNetwork).toBe(true);
    expect(err.message).toMatch(/cannot reach the server/i);
    expect(await loadMobileSession(bridge)).toBeNull();
  });

  it('authenticateWithMobileOtp verifies the code and stores the session', async () => {
    const request = vi.fn<(req: { url: string; body?: string }) => Promise<ReturnType<typeof ok>>>(
      async () => ok({ ...TOKENS, user: IDENTITY })
    );
    const { bridge } = await makeBridge(request);

    const session = await authenticateWithMobileOtp(bridge, 'budi@example.com', '123456');
    expect(session.authSource).toBe('mobile');
    expect(await loadMobileSession(bridge)).not.toBeNull();

    const body = JSON.parse(request.mock.calls[0][0].body as string);
    expect(body).toMatchObject({ email: 'budi@example.com', otp: '123456' });
    expect(request.mock.calls[0][0].url).toContain('/auth/otp/verify');
  });

  it('requestMobileLoginCode passes the tenant slug and returns devCode', async () => {
    const request = vi.fn<(req: { url: string; body?: string }) => Promise<ReturnType<typeof ok>>>(
      async () => ok({ sent: true, devCode: '654321' })
    );
    const { bridge } = await makeBridge(request);
    await bridge.kv.set('auth.mobileTenantSlug', 'acme');

    const result = await requestMobileLoginCode(bridge, 'budi@example.com');
    expect(result).toEqual({ sent: true, devCode: '654321' });

    const body = JSON.parse(request.mock.calls[0][0].body as string);
    expect(body).toMatchObject({ email: 'budi@example.com', tenantSlug: 'acme' });
    expect(request.mock.calls[0][0].url).toContain('/auth/otp/request');
  });

  it('ensureFreshAccessToken keeps a valid token untouched', async () => {
    const request = vi.fn(async () => ok({ ...TOKENS, user: IDENTITY }));
    const { bridge } = await makeBridge(request);
    await saveMobileSession(bridge, {
      email: IDENTITY.email,
      tenant_slug: 'default',
      access_token: 'still-valid',
      refresh_token: TOKENS.refreshToken,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      identity_json: JSON.stringify(IDENTITY),
    });

    expect(await ensureFreshAccessToken(bridge, makeClient(bridge))).toBe('ok');
    expect(request).not.toHaveBeenCalled();
    expect((await loadMobileSession(bridge))!.access_token).toBe('still-valid');
  });

  it('ensureFreshAccessToken rotates an expired token', async () => {
    const request = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {},
      body: '',
      json: {
        success: true,
        data: { accessToken: 'access-2', refreshToken: 'tenantid01.rotated', tokenType: 'Bearer', expiresIn: 900 },
      },
    }));
    const { bridge } = await makeBridge(request);
    await saveMobileSession(bridge, {
      email: IDENTITY.email,
      tenant_slug: 'default',
      access_token: 'expired',
      refresh_token: TOKENS.refreshToken,
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      identity_json: JSON.stringify(IDENTITY),
    });

    expect(await ensureFreshAccessToken(bridge, makeClient(bridge))).toBe('fresh');
    const row = (await loadMobileSession(bridge))!;
    expect(row.access_token).toBe('access-2');
    expect(row.refresh_token).toBe('tenantid01.rotated');
  });

  it('ensureFreshAccessToken returns unauthorized when the refresh token is revoked', async () => {
    const request = vi.fn(async () => fail(401, 'Invalid or expired refresh token'));
    const { bridge } = await makeBridge(request);
    await saveMobileSession(bridge, {
      email: IDENTITY.email,
      tenant_slug: null,
      access_token: 'expired',
      refresh_token: 'revoked',
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      identity_json: null,
    });

    expect(await ensureFreshAccessToken(bridge, makeClient(bridge))).toBe('unauthorized');
  });

  it('ensureFreshAccessToken keeps the session when the framework is unreachable', async () => {
    const request = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const { bridge } = await makeBridge(request);
    await saveMobileSession(bridge, {
      email: IDENTITY.email,
      tenant_slug: null,
      access_token: 'expired',
      refresh_token: 'keep-me',
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      identity_json: null,
    });

    expect(await ensureFreshAccessToken(bridge, makeClient(bridge))).toBe('network');
    expect((await loadMobileSession(bridge))!.refresh_token).toBe('keep-me');
  });

  it('clearMobileSession removes the stored row', async () => {
    const { bridge } = await makeBridge();
    await saveMobileSession(bridge, {
      email: IDENTITY.email,
      tenant_slug: null,
      access_token: 'a',
      refresh_token: 'r',
      expires_at: null,
      identity_json: null,
    });
    expect(await loadMobileSession(bridge)).not.toBeNull();
    await clearMobileSession(bridge);
    expect(await loadMobileSession(bridge)).toBeNull();

    // a missing row must NOT be treated as revocation (debounced-write race)
    const request = vi.fn(async () => fail(401, 'Invalid or expired refresh token'));
    const { bridge: withMock } = await makeBridge(request);
    expect(await ensureFreshAccessToken(withMock, makeClient(withMock))).toBe('none');
    expect(request).not.toHaveBeenCalled();
  });
});
