import { describe, expect, it } from 'vitest';
import { parseActivationInput } from '@/sync/credentials';

/** base64url-encode a JSON payload the way the backend does. */
const b64url = (obj: unknown): string =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const DEVICE_TOKEN = `dev_live_${'a'.repeat(64)}`;

describe('parseActivationInput', () => {
  it('rejects empty input', () => {
    expect(parseActivationInput('   ')).toMatchObject({ kind: 'error' });
  });

  it('extracts the code from a full activation link', () => {
    const code = b64url({ activationToken: 'act-1', tenantId: 't-1' });
    const result = parseActivationInput(`https://framework.weha-id.com/device/activate?token=${code}`);
    expect(result).toEqual({ kind: 'activation', token: code });
  });

  it('passes an activation code ({activationToken, tenantId}) through unchanged', () => {
    const code = b64url({ activationToken: 'act-1', tenantId: 't-1' });
    expect(parseActivationInput(code)).toEqual({ kind: 'activation', token: code });
  });

  it('recognizes post-activation credentials ({deviceToken, tenantId})', () => {
    const blob = b64url({ deviceToken: DEVICE_TOKEN, tenantId: 't-1' });
    expect(parseActivationInput(blob)).toEqual({ kind: 'device', deviceToken: DEVICE_TOKEN, tenantId: 't-1' });
  });

  it('accepts a bare device token when a tenant is supplied', () => {
    expect(parseActivationInput(DEVICE_TOKEN, 'acme')).toEqual({
      kind: 'device',
      deviceToken: DEVICE_TOKEN,
      tenantId: 'acme',
    });
  });

  it('rejects a bare device token that has no tenant', () => {
    expect(parseActivationInput(DEVICE_TOKEN)).toMatchObject({ kind: 'error' });
  });

  it('rejects base64url JSON that is neither shape', () => {
    expect(parseActivationInput(b64url({ foo: 'bar' }))).toMatchObject({ kind: 'error' });
  });

  it('rejects unrecognized input', () => {
    expect(parseActivationInput('garbage')).toMatchObject({ kind: 'error' });
  });
});
