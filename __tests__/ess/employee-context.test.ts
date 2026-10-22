import { describe, expect, it } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { saveMobileSession } from '@/auth/mobile-session';
import { fetchProfileEnrichment, loadEmployeeContext } from '@/lib/ess/employee-context';
import type { SessionUser } from '@/stores/auth';

const IDENTITY = {
  userId: 'u1',
  employeeId: 'E-42',
  portalUserId: 'p1',
  email: 'alice@weha.example',
  name: 'Alice',
  tenantSlug: 'acme',
};

const MOBILE_SESSION: SessionUser = {
  id: 'mobile:u1',
  display_name: 'Alice',
  role: 'operator',
  permissions: ['app.use', 'ess.use'],
  authSource: 'mobile',
};

const LOCAL_SESSION: SessionUser = {
  id: 'u1',
  display_name: 'Bob',
  role: 'admin',
  permissions: ['app.use', 'users.manage'],
};

describe('loadEmployeeContext', () => {
  it('maps the verified mobile identity (employeeId, tenant, email)', async () => {
    const { bridge } = await createFakeBridge();
    await saveMobileSession(bridge, {
      email: IDENTITY.email,
      tenant_slug: IDENTITY.tenantSlug,
      access_token: null,
      refresh_token: 'r',
      expires_at: null,
      identity_json: JSON.stringify(IDENTITY),
    });

    const ctx = await loadEmployeeContext(bridge, MOBILE_SESSION);

    expect(ctx.employeeId).toBe('E-42');
    expect(ctx.tenantId).toBe('acme');
    expect(ctx.email).toBe('alice@weha.example');
    expect(ctx.displayName).toBe('Alice');
    expect(ctx.roles).toEqual(['operator']);
    expect(ctx.permissions).toContain('ess.use');
    expect(ctx.authSource).toBe('mobile');
  });

  it('returns null identity fields for a local device account', async () => {
    const { bridge } = await createFakeBridge();
    const ctx = await loadEmployeeContext(bridge, LOCAL_SESSION);

    expect(ctx.employeeId).toBeNull();
    expect(ctx.tenantId).toBeNull();
    expect(ctx.email).toBeNull();
    expect(ctx.authSource).toBe('local');
    expect(ctx.roles).toEqual(['admin']);
  });

  it('survives corrupt identity_json without throwing', async () => {
    const { bridge } = await createFakeBridge();
    await saveMobileSession(bridge, {
      email: IDENTITY.email,
      tenant_slug: null,
      access_token: null,
      refresh_token: 'r',
      expires_at: null,
      identity_json: '{not-json',
    });

    const ctx = await loadEmployeeContext(bridge, MOBILE_SESSION);
    expect(ctx.employeeId).toBeNull();
    expect(ctx.displayName).toBe('Alice');
  });

  it('marks profile enrichment as pending (never fake employee data)', async () => {
    const enrichment = await fetchProfileEnrichment();
    expect(enrichment).toEqual({ employeeCode: null, departmentId: null, source: 'pending' });
  });
});
