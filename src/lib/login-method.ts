// Build-time login methods — which sign-in types the login page offers.
// Set via NEXT_PUBLIC_LOGIN_METHOD (inlined at build time). The value is a
// comma-separated list of enabled types, or 'all':
//   NEXT_PUBLIC_LOGIN_METHOD=pin,password,mobile   → all three (same as 'all')
//   NEXT_PUBLIC_LOGIN_METHOD=pin,password          → only those two
//   NEXT_PUBLIC_LOGIN_METHOD=password              → only password
//   unset / 'all' / unknown tokens                 → fall back to all three
// The login page lets the user SWITCH between the enabled types on the page
// (HRD-mobile style toggle links); this only decides which types are available.

export const LOGIN_METHODS = ['pin', 'password', 'mobile'] as const;

export type LoginMethod = (typeof LOGIN_METHODS)[number];

const ALL: LoginMethod[] = [...LOGIN_METHODS];

/**
 * The enabled login types for this build, in canonical order.
 * Accepts a comma-separated list or 'all'; ignores unknown tokens; dedupes;
 * falls back to every method when nothing valid is configured.
 */
export function enabledLoginMethods(): LoginMethod[] {
  const raw = process.env.NEXT_PUBLIC_LOGIN_METHOD;
  if (!raw || raw.trim() === '' || raw.trim().toLowerCase() === 'all') return ALL;

  const tokens = raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t): t is LoginMethod => (LOGIN_METHODS as readonly string[]).includes(t));

  // Dedupe, preserving canonical order.
  const selected = LOGIN_METHODS.filter((m) => tokens.includes(m));
  return selected.length > 0 ? selected : ALL;
}
