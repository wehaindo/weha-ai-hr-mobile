---
name: login-methods
description: Explain and configure the device app's three sign-in methods — PIN grid, username+password, and WEHA mobile account (password/OTP) — including which table each verifies against, how to enable or disable them via NEXT_PUBLIC_LOGIN_METHOD, seeded credentials, and troubleshooting (employee missing from PIN grid, portal password rejected, mobile tenant setup). Use when the user asks about login methods, sign-in options, NEXT_PUBLIC_LOGIN_METHOD, or why a method or user does not appear.
argument-hint: "[pin|password|mobile]"
---

# Login methods — PIN · password · mobile

The login page offers exactly three sign-in types, defined once in
`src/lib/login-method.ts` (`LOGIN_METHODS`). `LoginScreen.tsx` reads
`deviceConfig.loginMethods` and renders toggle links between the enabled types.

## The three methods

| Method | UI | Verifies against | Offline? |
|---|---|---|---|
| `pin` | PIN grid | local `users.pin_hash` → fallback `employees.device_pin_hash` (bcrypt) | ✅ |
| `password` | username + password | `portal_users` (email) → fallback local `users.password_hash` (bcrypt) | ✅ |
| `mobile` | WEHA account: password + email OTP | framework API `/api/mobile/v1/auth/*` via `NEXT_PUBLIC_ERP_BASE_URL` | ❌ network |

**PIN** (`authenticate()` in `src/auth/actions.ts`): the grid is built by
`fetchActiveUsers()` = active `users` **plus** employees with
`device_pin_hash IS NOT NULL AND is_active`. Employee free-text roles go through
`mapRole()` → Administrator / Manager / Operator (default operator). Lockout
(max attempts, window) comes from Settings → Security.

**Password** (`authenticateWithCredentials()`): **portal first** —
`authenticatePortalUser()` matches `portal_users.email` case-insensitively; if the
credential is not a portal email it returns null and the caller falls back to local
`users.username`. If it IS a portal account, a wrong password throws (no silent
fallback). Synced passwords are verified offline against `password_hash`.

**Mobile** (`authenticateWithMobile` / `authenticateWithMobileOtp` /
`requestMobileLoginCode`): first run shows the tenant-setup card — the slug must be
saved (`setMobileTenantSlug`) before the form appears. Session tokens persist and
refresh on boot (`src/auth/bootstrap.ts`). Requires the framework reachable.

## Enable / disable — build-time env

`NEXT_PUBLIC_LOGIN_METHOD` in `.env`:

```
NEXT_PUBLIC_LOGIN_METHOD=pin              # kiosk: PIN only
NEXT_PUBLIC_LOGIN_METHOD=pin,password     # no mobile account
NEXT_PUBLIC_LOGIN_METHOD=pin,password,mobile   # same as 'all' (default)
```

Rules (`enabledLoginMethods()`): comma-separated tokens, unknown tokens ignored,
deduped into canonical order; **unset / 'all' / nothing valid → all three**.
It is `NEXT_PUBLIC_*` → inlined at build → **rebuild the target** after changing
it (`npm run build`, `electron:build`, `cap:sync` …).

Default mode on the page = `pin` when enabled, else the first enabled method.
E2E hooks: `data-testid` `toggle-password-login` / `toggle-mobile-login`; a Back
link appears whenever `pin` is enabled and the user switched away from it.

## Where credentials come from

- **Local users** — `users` table; seeded admin (PIN **1234**, password
  **admin/admin123**) via migrations `0004_seed` / `0020_user_credentials` /
  `0025_seed_demo_user`. Never edit applied migrations — add a new one to change.
- **Employees** — synced by the EMPLOYEES integration; the device PIN hash is set
  server-side and arrives as `employees.device_pin_hash`.
- **Portal users** — synced by the PORTAL_USERS integration
  (`portal_users.password_hash`, `email`).
- **Mobile** — no local credential; tokens live in the mobile-session store.

## Troubleshooting

- **Employee not in the PIN grid** → no `device_pin_hash` or `is_active = 0`
  (`fetchActiveUsers` filter). Set the PIN in the framework, resync.
- **Password rejected for a synced user** → must be the portal email
  (case-insensitive). Once a portal account matches that email, wrong passwords
  throw instead of falling back to local users.
- **"Tenant setup" on mobile login** → save the tenant slug first (first-run card).
- **A method is missing from the page** → `NEXT_PUBLIC_LOGIN_METHOD` in the env
  used for *that* build; rebuild.
- **Lockout messages** → Settings → Security (attempts/window), not method config.

Docs: `docs/MOBILE-AUTH.md` (mobile flow + env), `docs/FEATURES.md` auth
section. Code: `src/lib/login-method.ts`, `src/auth/actions.ts`,
`src/auth/components/LoginScreen.tsx`.
