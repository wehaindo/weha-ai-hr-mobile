# ESS API Contract — for the WEHA Framework backend

Target implementation: `weha-framework` (the repo is **not modified by the ESS
client team**; this document is the interface the backend implements separately).

Base URL: `{NEXT_PUBLIC_ERP_BASE_URL}` (same origin as mobile auth, dev `:3178`).
All routes live under `/api/mobile/v1/` — the Phase 1 convention — and follow the
existing conventions in:

- `app/api/mobile/v1/employees/me/route.ts` (GET — exists today)
- `lib/mobile-api-auth.ts` (JWT sign/verify, `MOBILE_CORS_HEADERS`)
- `lib/base-route-handler.ts` (`createRouteHandler({ authType: 'mobile' })`,
  automatic write-method audit via `recordAudit`)
- `prisma/tenant/schema.prisma` (`Employee`, `AuditLog`)

Envelope (existing): success `{ "success": true, "data": … }`, failure
`{ "success": false, "error": "<code>", "message": "<human text>" }`.
CORS: `MOBILE_CORS_HEADERS` on `OPTIONS` + responses (already includes `PATCH`).

## 1. Existing endpoints the client uses as-is

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/auth/login` | Password sign-in → token pair + identity | Exists |
| POST | `/auth/otp/request`, `/auth/otp/verify` | Email-code sign-in | Exists |
| POST | `/auth/refresh`, `/auth/logout` | Rotate / revoke refresh token | Exists |
| GET | `/auth/me` | Identity carried by the access token + linked employee/portal-user | Exists (`app/api/mobile/v1/auth/me/route.ts`) |
| GET | `/employees/me` | **The profile endpoint** — employee resolved from the token | Exists; see §1.1 |

### 1.1 `GET /api/mobile/v1/employees/me` — current response

`data.employee` fields (from the route's `select`): `id`, `employeeNumber`,
`firstName`, `lastName`, `name`, `email`, `phone`, `status`, `isActive`,
`companyId`, `departmentId`, `positionId`, `managerId`, `position`, `hireDate`,
`birthDate`, `gender`, `maritalStatus`, `avatarColor`.

Security properties already correct — keep them:

- Employee id comes from the JWT claims (`context.employeeId`), never from the
  request; 403 when no employee is linked.
- Sensitive columns are **not** selected: `nik`, `npwp`, `salary`, `bankName`,
  `bankAccountNumber`, `bankAccountName`, `taxStatus`, `commissionRate`.

**Requested additive change (small):** include display names in the select so
the client does not need extra round-trips:

```ts
company:     { select: { id: true, name: true } },
department:  { select: { id: true, name: true } },
manager:     { select: { id: true, firstName: true, lastName: true, name: true } },
```

Until this lands, the client falls back to showing the raw ids.

## 2. New endpoint to implement: `PATCH /api/mobile/v1/employees/me`

Self-service update of permitted profile fields (BRD §4.3).

### 2.1 Authentication / identity

- Same handler style: `createRouteHandler({ authType: 'mobile', method: 'PATCH' })`.
- The employee to update is **resolved from the access-token claims only**.
- The request body **MUST NOT** accept `id` / `employeeId` / `companyId` as an
  identity selector. If present, they are rejected (see §2.3) — BRD §3/§6:
  "the application must never rely on a client-supplied `employeeId`".
- 401 for missing/invalid/expired token; 403 when the token has no linked
  employee.

### 2.2 Request body (allowlist)

```jsonc
{
  "email": "employee@example.com",   // optional, ≤ 254 chars, RFC-ish format, trimmed+lowercased
  "phone": "+628123456789"           // optional, ≤ 32 chars, trimmed
}
```

- Editable fields = **exactly these two** (Phase 2 scope decision; the Employee
  table has no address/photo/emergency-contact columns — do not invent them).
- At least one recognized field must be present, otherwise `400`.
- `email` must not collide with another `Employee.email` (`@unique` column) →
  `409`.

### 2.3 Error responses

| Case | Status | `error` code | Notes |
|---|---|---|---|
| Missing/invalid/expired token | 401 | `unauthorized` | Existing convention |
| No employee linked to account | 403 | `no_employee` | Same as GET today |
| Any non-allowlisted key (e.g. `departmentId`, `salary`, `status`, `employeeNumber`, `id`) | 403 | `protected_field` | Must list offending keys in `message` |
| Bad value (invalid email/phone, empty body after normalization) | 400 | `validation` | Field-level detail in `message` |
| Email already used by another employee | 409 | `conflict` | |

### 2.4 Success response

`{ "success": true, "data": { "employee": { … } } }` — the updated row using
**the same `select` as GET §1.1** (including the requested relation names).

### 2.5 Audit (automatic)

Write methods through `createRouteHandler` already call `auditLog()` →
`recordAudit()` (`lib/base-route-handler.ts` ≈ line 1157, `lib/audit.ts`):
entity `employee`, action `PATCH`, `entityId` = token employee id, metadata
containing only the changed field names + old/new values of the allowed fields
(no salary or other sensitive values ever).

## 3. Dashboard / services endpoints — intentionally not required (Phase 2)

The BRD's `/api/ess/dashboard` and `/api/ess/services` are logical
requirements; per BRD §5.1 ("adapt to existing conventions") Phase 2 renders:

- dashboard **data** from `GET /employees/me`,
- widget/shortcut **configuration** from the client-side widget registry
  (`src/lib/ess/widgets/registry.ts` in the ESS app — id, title, order,
  permission, route, enabled).

Appendix (future, optional): when administrators need server-driven widget
configuration, add `GET /api/mobile/v1/ess/dashboard` returning
`{ widgets: [{ id, title, order, enabled, permission, href }] }` with the same
mobile auth; the client registry will then treat it as an override layer.
Not required for Phase 2 acceptance.

## 4. Security test matrix the backend must pass (BRD §6.2 — release-blocking)

| # | Scenario | Expected |
|---|---|---|
| 1 | Employee fetches own profile (`GET /employees/me`) | 200 |
| 2 | Employee PATCHes own profile with `{phone}` | 200, updated employee, audit row written |
| 3 | Body contains `{"id": "<other employee>"}` | 403 `protected_field`; **no row updated** (token employee used only) |
| 4 | Body contains `{"salary": …}` or `{"departmentId": …}` | 403 `protected_field`; no update |
| 5 | Token from tenant A calls route | Tenant A DB only (JWT `tenantId` → `getTenantClientForDevice`); tenant B data unreachable |
| 6 | Expired access token | 401 |
| 7 | Refresh token revoked (logged out), old access used after expiry | 401 → client reauthenticates |
| 8 | `{"email": "not-an-email"}` / `{"email": ""}` | 400 `validation`; no update |
| 9 | `{"email": "<already used>"}` on a different employee | 409 `conflict`; no update |
| 10 | Response of GET/PATCH never contains `salary`, `nik`, `npwp`, bank fields | Absent from payload |
| 11 | UI hiding vs API: direct PATCH call bypassing the UI | Same auth/validation as UI (no separate path) |

Client-side companion assertions (this repo, mocked): requests never include an
employee id or non-allowlisted keys; unknown response fields are stripped before
render (zod `.strip()`).

## 5. Environment

- `MOBILE_ACCESS_SECRET` — set a long random value in production (dev fallback
  exists in `lib/mobile-api-auth.ts`).
- CORS already open for the mobile routes (`Access-Control-Allow-Origin: *`).
- The client sends `Authorization: Bearer <access token>` (15-min TTL, refreshed
  with a 5-minute skew before each ESS call) and `x-device-name` (cosmetic).
