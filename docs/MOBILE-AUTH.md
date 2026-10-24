# Mobile Auth — signing in with a WEHA account

The device app has **three login modes** on the login screen (`/`):

| Mode | Where it validates | Needs network? |
|---|---|---|
| **PIN** (default, user grid + keypad) | Local SQLite (`users.pin_hash`, bcrypt) | No |
| **Username & password** | Local SQLite (`users.password_hash`, bcrypt) | No |
| **WEHA account** ("Sign in with WEHA account") | weha-framework `/api/mobile/v1/auth/*` | Yes (at sign-in) |

Mobile auth lets a framework user (a **PortalUser**, usually linked to an
Employee) sign into a device with their email — no local device account
required. The local PIN/password logins are untouched and keep the device
usable offline.

## How it works

```
 device (weha-device-framework)                 weha-framework (:3178)
 ┌──────────────────────────────┐   POST /api/mobile/v1/auth/login ─┐
 │ LoginScreen (3rd mode)       │   …/auth/otp/request|verify      │
 │  → src/auth/actions.ts       │ ────────────────────────────────▶ │ JWT access (15m, HS256)
 │  → src/integration/          │   …/auth/refresh  (rotates)      │ + opaque refresh (30d)
 │      mobile-auth/client.ts   │ ◀──────────────────────────────── │ stored hashed in
 │ tokens → SQLite              │   …/auth/logout   (revokes)      │ MobileSession rows
 └──────────────────────────────┘                                  └──────────────────────────────
```

- **Session-only identity**: a mobile login does *not* create a row in the
  local `users` table. The framework identity lives in the persisted zustand
  session (`device-auth`) as `authSource: 'mobile'`, with a fixed **operator**
  permission set (`app.use`, `transactions.use`).
- **Token pair** is stored in the local table `mobile_auth_sessions`
  (migration `0024_mobile_auth`): the access token (15 min) + refresh token
  (30 days). On boot, `useAuthBootstrap()` refreshes the pair when the access
  token is near expiry.
- **Offline-tolerant**: if the framework is unreachable at boot, the session
  is kept (the device works normally). Only a definitive *revoked refresh
  token* (HTTP 401/403) logs the user out.
- **Logout** (header → Sign out) revokes the refresh token server-side
  (idempotent — safe when offline), clears `mobile_auth_sessions`, then ends
  the local session.
- HTTP goes through `bridge.cloud.request`, so it works identically on web,
  Electron (IPC, no CORS) and Capacitor.

## 1. Prepare the device

1. **Framework URL** — set it in `.env.local` (see `.env.example`):

   ```env
   NEXT_PUBLIC_ERP_BASE_URL=http://localhost:3178   # your weha-framework
   ```

   This single URL drives both ERP sync and mobile auth. It is inlined at
   **build time** — rebuild (`npm run build`) after changing it.

2. **Framework secret** — in weha-framework's env, set a long random
   `MOBILE_ACCESS_SECRET` for production (a dev fallback exists, so local
   dev works without it). CORS is already open (`*`) on the mobile routes.

3. **Tenant slug** — quickest: use the **Tenant (optional)** field directly
   on the WEHA-account login card (multi-tenant servers require it; the value
   is remembered after a successful sign-in). Alternatively set it on the
   device: **Settings → Security → Mobile login (WEHA account)** → enter the
   tenant slug → Save. Leave it **empty for single-tenant** deployments (the
   framework then uses its default tenant). The Settings card also shows the
   framework URL in effect.

4. Keep the framework running when someone signs in with a WEHA account.
   PIN / local logins work with the framework stopped.

## 2. First login (setup link from weha-framework)

Mobile auth is **portal-account based**. A user gets their mobile credential
once, via a one-time **setup link** (valid 24h) issued by an admin:

**Issue the link** (either way):

- **Dashboard**: Employees → account actions → *send mobile setup*
  (`POST /api/tenant/employees/{id}/send-mobile-setup` — emails the link), or
- **CLI** (creates the portal account if missing, prints the URL):

  ```bash
  cd ../weha-framework
  npm run mobile:setup -- user@example.com [tenantSlug]
  ```

**Complete it** (in any browser):

1. Open the link: `/portal/mobile-setup?tenant=<slug>&token=<one-time>`.
2. Set a **mobile password** (min. 8 characters). The token is consumed; the
   browser session that completes setup is logged into the portal.

**Then sign in on the device:**

1. Login screen → **"Sign in with WEHA account"**.
2. Enter **email + password** → **Sign in** → the dashboard opens.
3. Sign out later via the header menu; the refresh token is revoked remotely.

### If something else happens

| Message on the device | Meaning | What to do |
|---|---|---|
| *No mobile account exists… send a setup link* (`setup_required`) | No portal user for this email | Admin sends a setup link (steps above) |
| *This account has no mobile password* (`otp_required`) | Portal user exists but never completed setup | Form auto-switches to the **code (OTP)** flow — see below, or complete a setup link |
| *Invalid email or password* (401) | Wrong credentials | Retry; counts toward the same lockout policy as PIN login |
| *Cannot reach the server* | Framework down / wrong `NEXT_PUBLIC_ERP_BASE_URL` | Check the URL and that weha-framework is running |

### OTP (email code) fallback

For accounts **without** a mobile password (or if you prefer codes):

1. On the WEHA-account form, click **"Email me a login code instead"**.
2. **Email me a login code** → the framework emails a 6-digit code
   (10-min TTL, max 5 attempts). In non-production the response also carries
   `devCode`, shown on the form as *(dev code: …)*.
3. Enter the code → **Sign in**.

Setting a mobile password later (setup link) unlocks password sign-in.

## Configuration reference

| What | Where | Key / value |
|---|---|---|
| Framework base URL | `.env.local` → `device.config.ts` | `NEXT_PUBLIC_ERP_BASE_URL` |
| Tenant slug | Login card **Tenant** field (remembered after sign-in), or Settings → Security → *Mobile login* | `device_settings` key `auth.mobileTenantSlug` (empty = single-tenant) |
| Token pair | SQLite (device) | table `mobile_auth_sessions` (single row) |
| Session identity/perms | Browser localStorage | zustand key `device-auth` (`authSource: 'mobile'`) |
| Access JWT secret | weha-framework env | `MOBILE_ACCESS_SECRET` (HS256, 15 min) |
| Refresh/OTP TTLs | weha-framework | 30 days / 10 minutes (constants in `lib/mobile-api-auth.ts`) |

## Endpoints consumed

Base `{NEXT_PUBLIC_ERP_BASE_URL}/api/mobile/v1` (envelope `{success, data}`
/ `{success:false, error, message?}`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | `{tenantSlug?, email, password}` → token pair + identity |
| POST | `/auth/otp/request` | `{tenantSlug?, email}` → sends a code (`devCode` in dev) |
| POST | `/auth/otp/verify` | `{tenantSlug?, email, otp}` → token pair + identity |
| POST | `/auth/refresh` | `{refreshToken}` → rotated pair (old one revoked) |
| POST | `/auth/logout` | `{refreshToken}` → revokes (idempotent) |

## Tests

```bash
npm run test:run                          # includes __tests__/auth/mobile-auth.test.ts
npx playwright test tests/e2e/mobile-login.spec.ts tests/e2e/login.spec.ts
```

The e2e suite mocks the framework with Playwright route interception (no
running weha-framework needed).
