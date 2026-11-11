// Recognizes the several forms an operator might paste into the activation box
// and turns them into a concrete credential action. Three shapes are accepted:
//
//   1. Activation code  base64url({ activationToken, tenantId })  → POST /api/device/activate
//   2. Activation link  https://…/device/activate?token=<code>    → same, token extracted
//   3. Device token     base64url({ deviceToken, tenantId })  or a bare `dev_live_…`
//                       → provision locally (no activation round-trip)
//
// Shape 3 is what the backend returns AFTER activation (encodedCredentials) and
// what scripts like create-device-token.ts mint directly — useful for a device
// that is already ACTIVE on the server.

export type ParsedCredential =
  /** Send `token` verbatim to POST /api/device/activate. */
  | { kind: 'activation'; token: string }
  /** Store locally — the device already holds a usable device token. */
  | { kind: 'device'; deviceToken: string; tenantId: string }
  | { kind: 'error'; message: string };

/** `dev_live_<64 hex>` / `dev_test_<64 hex>` (see weha-framework lib/api-token.ts). */
const DEVICE_TOKEN_RE = /^(dev_live_|dev_test_)[0-9a-f]{64}$/;

/**
 * Parse pasted input into a credential action.
 * @param configuredTenant fallback tenant for a bare device token (which carries none).
 */
export function parseActivationInput(raw: string, configuredTenant?: string): ParsedCredential {
  let value = raw.trim();
  if (!value) {
    return { kind: 'error', message: 'Paste an activation code, activation link, or device token.' };
  }

  // An activation link carries the code in ?token=
  if (/^https?:\/\//i.test(value)) {
    try {
      const fromLink = new URL(value).searchParams.get('token');
      if (fromLink) value = fromLink.trim();
    } catch {
      /* not a URL we can parse — treat the raw string below */
    }
  }

  // base64url JSON — either the activation input or the post-activation credentials.
  const decoded = tryDecodeJson(value);
  if (decoded && typeof decoded === 'object') {
    const obj = decoded as Record<string, unknown>;
    if (typeof obj.activationToken === 'string' && typeof obj.tenantId === 'string') {
      return { kind: 'activation', token: value };
    }
    if (typeof obj.deviceToken === 'string' && typeof obj.tenantId === 'string') {
      return { kind: 'device', deviceToken: obj.deviceToken, tenantId: obj.tenantId };
    }
    return {
      kind: 'error',
      message: 'Token is missing activationToken/tenantId (or deviceToken/tenantId).',
    };
  }

  // Bare device token — it has no tenant, so one must be supplied.
  if (DEVICE_TOKEN_RE.test(value)) {
    const tenant = configuredTenant?.trim();
    if (!tenant) {
      return { kind: 'error', message: 'A device token needs a tenant slug — enter it below.' };
    }
    return { kind: 'device', deviceToken: value, tenantId: tenant };
  }

  return {
    kind: 'error',
    message: 'Unrecognized — paste an activation code, activation link, or dev_live_ device token.',
  };
}

/** base64url → JSON, or null when it is not decodable JSON. Browser-safe (no Buffer). */
function tryDecodeJson(value: string): unknown {
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
