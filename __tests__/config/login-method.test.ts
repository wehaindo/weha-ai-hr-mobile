// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEnabled(value: string | undefined) {
  vi.resetModules();
  // Always stub explicitly (even for the "unset" case → '') so an ambient
  // NEXT_PUBLIC_LOGIN_METHOD in the shell can't leak into the assertion.
  vi.stubEnv('NEXT_PUBLIC_LOGIN_METHOD', value ?? '');
  const mod = await import('@/lib/login-method');
  return mod.enabledLoginMethods();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('enabledLoginMethods (NEXT_PUBLIC_LOGIN_METHOD)', () => {
  it('defaults to all three when unset', async () => {
    expect(await loadEnabled(undefined)).toEqual(['pin', 'password', 'mobile']);
  });

  it('accepts a single method', async () => {
    expect(await loadEnabled('pin')).toEqual(['pin']);
    expect(await loadEnabled('password')).toEqual(['password']);
    expect(await loadEnabled('mobile')).toEqual(['mobile']);
  });

  it('accepts a comma-separated subset', async () => {
    expect(await loadEnabled('pin,mobile')).toEqual(['pin', 'mobile']);
    expect(await loadEnabled('password,mobile')).toEqual(['password', 'mobile']);
  });

  it('treats "all" as all three', async () => {
    expect(await loadEnabled('all')).toEqual(['pin', 'password', 'mobile']);
  });

  it('ignores unknown tokens', async () => {
    expect(await loadEnabled('nope')).toEqual(['pin', 'password', 'mobile']);
    expect(await loadEnabled('pin,bogus,mobile')).toEqual(['pin', 'mobile']);
  });

  it('dedupes and preserves canonical order', async () => {
    expect(await loadEnabled('mobile,pin,pin')).toEqual(['pin', 'mobile']);
  });
});
