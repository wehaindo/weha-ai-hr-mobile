// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import type { CloudRequest, DeviceBridge } from '@/platform';
import {
  AuthUnavailableError,
  authorize,
  authRequest,
  getDeviceAuth,
  getToken,
  hasAuthProvider,
  listAuthProviders,
  registerAuthProvider,
  resetAuthProviders,
  unregisterAuthProvider,
} from '@/auth/manager';

async function seedDeviceToken(bridge: DeviceBridge, token: string): Promise<void> {
  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO integrations (id, name, kind, config, status, device_token, created_at, updated_at)
     VALUES ('erp', 'WEHA ERP', 'erp', '{}', 'active', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET device_token = excluded.device_token`,
    [token, now, now]
  );
}

async function seedDatahubToken(bridge: DeviceBridge, token: string): Promise<void> {
  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO datahub_configs (id, name, endpoint, device_token, enabled, created_at, updated_at)
     VALUES ('cfg-1', 'Data Hub', 'http://hub.local', ?, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET device_token = excluded.device_token`,
    [token, now, now]
  );
}

/** Seed an activated device with a bound tenant in the integration config. */
async function seedDeviceAuth(
  bridge: DeviceBridge,
  token: string,
  tenantId: string
): Promise<void> {
  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO integrations (id, name, kind, config, status, device_token, created_at, updated_at)
     VALUES ('erp', 'WEHA ERP', 'erp', ?, 'active', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET device_token = excluded.device_token, config = excluded.config`,
    [JSON.stringify({ tenantId }), token, now, now]
  );
}

beforeEach(() => {
  resetAuthProviders();
});

describe('auth registry', () => {
  it('registers the built-in device, datahub and mobile providers', async () => {
    expect(hasAuthProvider('device')).toBe(true);
    expect(hasAuthProvider('datahub')).toBe(true);
    expect(hasAuthProvider('mobile')).toBe(true);
    expect(listAuthProviders()).toEqual(expect.arrayContaining(['device', 'datahub', 'mobile']));
  });

  it('registerAuthProvider overrides a built-in', async () => {
    const { bridge } = await createFakeBridge();
    await seedDeviceToken(bridge, 'real-token');
    registerAuthProvider('device', { getToken: async () => 'custom-token' });

    expect(await getToken(bridge, 'device')).toBe('custom-token');
  });

  it('unregisterAuthProvider removes a provider', async () => {
    const { bridge } = await createFakeBridge();
    unregisterAuthProvider('device');

    expect(hasAuthProvider('device')).toBe(false);
    expect(await getToken(bridge, 'device')).toBeNull();
    await expect(authorize(bridge, 'device')).rejects.toMatchObject({ reason: 'missing-provider' });
  });

  it('resetAuthProviders restores the built-ins after an override', async () => {
    const { bridge } = await createFakeBridge();
    await seedDeviceToken(bridge, 'real-token');
    registerAuthProvider('device', { getToken: async () => 'custom-token' });
    unregisterAuthProvider('datahub');

    resetAuthProviders();

    expect(await getToken(bridge, 'device')).toBe('real-token');
    expect(hasAuthProvider('datahub')).toBe(true);
  });
});

describe('getToken', () => {
  it('resolves the device token from integrations', async () => {
    const { bridge } = await createFakeBridge();
    await seedDeviceToken(bridge, 'dev_live_secret');

    expect(await getToken(bridge, 'device')).toBe('dev_live_secret');
  });

  it('resolves the datahub token from datahub_configs', async () => {
    const { bridge } = await createFakeBridge();
    await seedDatahubToken(bridge, 'hub_token_123');

    expect(await getToken(bridge, 'datahub')).toBe('hub_token_123');
  });

  it('returns null when no credential is stored', async () => {
    const { bridge } = await createFakeBridge();

    expect(await getToken(bridge, 'device')).toBeNull();
    expect(await getToken(bridge, 'datahub')).toBeNull();
  });

  it('returns null for an unknown provider instead of throwing', async () => {
    const { bridge } = await createFakeBridge();

    expect(await getToken(bridge, 'does-not-exist')).toBeNull();
  });

  it('returns null from the mobile provider when there is no stored session', async () => {
    const { bridge } = await createFakeBridge();

    expect(await getToken(bridge, 'mobile')).toBeNull();
  });
});

describe('authorize', () => {
  it('adds Authorization: Bearer by default and keeps existing headers', async () => {
    const { bridge } = await createFakeBridge();
    await seedDeviceToken(bridge, 'dev_live_secret');

    const headers = await authorize(bridge, 'device', { 'Content-Type': 'application/json' });

    expect(headers.Authorization).toBe('Bearer dev_live_secret');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('does not mutate the caller-supplied headers object', async () => {
    const { bridge } = await createFakeBridge();
    await seedDeviceToken(bridge, 'dev_live_secret');

    const original = { 'Content-Type': 'application/json' };
    await authorize(bridge, 'device', original);

    expect(original).toEqual({ 'Content-Type': 'application/json' });
  });

  it('honors a provider-specific apply', async () => {
    const { bridge } = await createFakeBridge();
    registerAuthProvider('api-key', {
      getToken: async () => 'k-123',
      apply: (headers, token) => {
        headers['X-API-Key'] = token;
      },
    });

    const headers = await authorize(bridge, 'api-key');

    expect(headers['X-API-Key']).toBe('k-123');
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws AuthUnavailableError(missing-provider) for an unknown provider', async () => {
    const { bridge } = await createFakeBridge();

    await expect(authorize(bridge, 'nope')).rejects.toBeInstanceOf(AuthUnavailableError);
    await expect(authorize(bridge, 'nope')).rejects.toMatchObject({ reason: 'missing-provider' });
  });

  it('throws AuthUnavailableError(no-token) when the credential is absent', async () => {
    const { bridge } = await createFakeBridge();

    await expect(authorize(bridge, 'device')).rejects.toBeInstanceOf(AuthUnavailableError);
    await expect(authorize(bridge, 'device')).rejects.toMatchObject({ reason: 'no-token' });
  });
});

describe('authRequest', () => {
  it('attaches the auth headers to the outgoing cloud request', async () => {
    const { bridge } = await createFakeBridge();
    await seedDeviceToken(bridge, 'dev_live_secret');

    let sent: CloudRequest | undefined;
    const request = vi.fn(async (req: CloudRequest) => {
      sent = req;
      return { ok: true, status: 200, headers: {}, body: '' };
    });
    bridge.cloud.request = request as unknown as DeviceBridge['cloud']['request'];

    const res = await authRequest(bridge, 'device', {
      url: 'http://backend.local/api/x',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(res.ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(sent?.headers?.Authorization).toBe('Bearer dev_live_secret');
    expect(sent?.headers?.['Content-Type']).toBe('application/json');
  });

  it('propagates AuthUnavailableError when no credential exists', async () => {
    const { bridge } = await createFakeBridge();

    await expect(
      authRequest(bridge, 'device', { url: 'http://backend.local/api/x' })
    ).rejects.toBeInstanceOf(AuthUnavailableError);
  });
});

describe('getDeviceAuth', () => {
  it('resolves the device token together with its bound tenant', async () => {
    const { bridge } = await createFakeBridge();
    await seedDeviceAuth(bridge, 'dev_live_secret', 'tenant-abc');

    expect(await getDeviceAuth(bridge)).toEqual({ token: 'dev_live_secret', tenantId: 'tenant-abc' });
  });

  it('returns null when the device is not activated', async () => {
    const { bridge } = await createFakeBridge();
    expect(await getDeviceAuth(bridge)).toBeNull();
  });
});
