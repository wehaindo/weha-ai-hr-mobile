# ESS Attendance API Contract — for the WEHA Framework backend

> **PHASE 6 NOTE (superseding):** The request-record models proposed in §2
> below (`EssRequest` and the per-type request tables) are **superseded by
> `docs/ESS-MANAGER-CONTRACT.md` §1** — the implementation target is
> `weha-ai-hrd`, reusing its existing `LeaveRequest` / `AttendanceCorrection`
> / `AttendancePunch` tables driven through the approval engine. The
> attendance capture endpoints here (config/worksites/status/events/sync)
> and their semantics remain valid; only the §2 model proposals change.

Target implementation: `weha-framework` (the repo is **not modified by the ESS
client team**; this document is the interface the backend implements
separately). Companion to `docs/ESS-API-CONTRACT.md` (profile/auth) — reuse
its §5 environment notes, envelope, and mobile JWT without change.

Base URL: `{NEXT_PUBLIC_ERP_BASE_URL}`; all routes under `/api/mobile/v1/`
(Phase 1 convention; the BRD's `/ess/attendance/*` paths are logical and are
adapted here). Conventions verified in source:

- `lib/base-route-handler.ts:750-792` — `createRouteHandler({ authType:
  'mobile' })`: Bearer access JWT via `verifyAccessToken`, tenant from
  `payload.tenantId` → `getTenantClientForDevice(tenantId)`, and
  `context = { tenantDb, tenantId, employeeId: payload.employeeId, userId,
  request, params, body, query }`. **The employee to act on is always
  `context.employeeId` — never a request value.**
- `lib/base-route-handler.ts:1193-1198` — success envelope
  `{ "success": true, "data": … }`; use the existing failure convention
  `{ "success": false, "error": "<code>", "message": "<human text>" }`.
- `lib/base-route-handler.ts:583` — write-method audit via `recordAudit`;
  rate limiting helper exists at `lib/external-api/rate-limiter.ts`
  (response-header plumbing already in the base handler, line 1178).
- CORS: `MOBILE_CORS_HEADERS` on `OPTIONS` + responses (add `POST`/`GET`
  only; no new methods needed).

**Zero attendance code exists today**: no attendance/shift/geofence models in
`prisma/tenant/schema.prisma` and no `attendance` routes under `app/api/` —
this is a greenfield backend feature.

## 1. Proposed Prisma additions (tenant schema)

For the backend team to map onto the existing HR models (`Company`,
`Department`, `Store`, `Employee`, `EmployeeStore`, `Device`). Timestamps UTC.

### 1.1 `AttendanceWorksite`

```prisma
model AttendanceWorksite {
  id                 String   @id @default(cuid())
  companyId          String
  storeId            String?          // link to Store when the worksite is a branch
  name               String
  latitude           Decimal  @db.Decimal(10, 7)
  longitude          Decimal  @db.Decimal(10, 7)
  radiusMeters       Int      @default(100)
  maxAccuracyMeters  Int      @default(100)   // worst acceptable GPS accuracy
  qrPayload          String?             // signed, expiring code content (§4.3)
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([companyId])
}
```

Assignment: an employee's permitted worksites = work sites linked to their
`EmployeeStore` stores (primary store first) plus any company-wide site
(`storeId == null`). The client does not compute this — see §3.

### 1.2 `AttendancePolicy` (one row per company, or columns on the existing
tenant settings surface — backend's choice)

```prisma
model AttendancePolicy {
  id                       String   @id @default(cuid())
  companyId                String   @unique
  allowedMethods           String[] // subset of "GPS","QR" (Phase 3); "RFID","FINGERPRINT" reserved
  duplicateIntervalSeconds Int      @default(120)
  offlineAllowed           Boolean  @default(true)
  geofencePolicy           GeofencePolicy @default(REJECT) // REJECT | EXCEPTION
  maxAccuracyMeters        Int      @default(100)
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
}
enum GeofencePolicy { REJECT EXCEPTION }
```

### 1.3 `AttendanceEvent`

BRD §5 structure, server-owned fields marked. Identity and status are
**server-authoritative**.

```prisma
model AttendanceEvent {
  id                 String            @id              // client event id (16-hex, see §4.2)
  tenantId           String
  employeeId         String
  companyId          String
  attendanceType    AttendanceType                       // SERVER-inferred (BRD FR-02)
  method             AttendanceMethod
  capturedAt         DateTime                             // client capture time (evidence)
  receivedAt         DateTime          @default(now())    // SERVER clock (BRD FR-08)
  worksiteId         String?
  latitude           Decimal?          @db.Decimal(10, 7) // raw evidence, never trusted
  longitude          Decimal?          @db.Decimal(10, 7)
  accuracyMeters     Float?
  distanceMeters     Float?            // SERVER-recomputed distance to worksite
  qrPayload          String?                             // opaque QR evidence (§4.3)
  idempotencyKey     String
  status             AttendanceStatus                     // SERVER-set
  rejectionReason    String?
  duplicateOfEventId String?
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  @@unique([tenantId, idempotencyKey])
  @@index([tenantId, employeeId, capturedAt])
  @@index([tenantId, employeeId, status, receivedAt])
}
enum AttendanceType { CHECK_IN CHECK_OUT }
enum AttendanceStatus { ACCEPTED REJECTED }
enum AttendanceMethod { GPS QR RFID FINGERPRINT } // RFID/FINGERPRINT reserved, not issued in Phase 3
```

There is **no PENDING state server-side**: a submitted event is resolved to
ACCEPTED or REJECTED within the request (offline events arrive late but are
still resolved synchronously; the late-sync timestamp policy is a backend
config knob, suggested: reject `capturedAt` older than `POLICY_LATE_SYNC_HOURS`,
default 24 h, reason `stale_capture`).

### 1.4 `AttendanceCredential` (reserved, not Phase 3)

Employee ↔ credential references (`employeeId`, `type` (`RFID_CARD`…),
`reference` (hashed/protected), `isActive`) for a future terminal adapter.
Spec only — do not build until hardware is verified.

## 2. Server-side validation rules (authoritative)

For every submitted event, in order:

1. Employee from token (`context.employeeId`); 403 `no_employee` when the
   account has no linked employee; employee must be `status = ACTIVE`.
2. `method` ∈ policy `allowedMethods`, else reject `method_not_allowed`.
3. `idempotencyKey` uniqueness per tenant: a repeat returns the **original
   result** with `status: "DUPLICATE"` and `duplicateOfEventId` (BRD FR-06
   #8) — HTTP 200, not an error.
4. `attendanceType` inference from today's accepted events + policy
   (BRD FR-02): no accepted CHECK_IN → CHECK_IN; open CHECK_IN → CHECK_OUT;
   configured shift rules may override. **Never taken from the request.**
5. Duplicate interval (policy): an event of the **same** `attendanceType`
   within `duplicateIntervalSeconds` of the last accepted event is folded
   into that event (`DUPLICATE`). A different `attendanceType` (i.e. a
   legitimate check-out) is **never** suppressed.
6. GPS evidence: recompute haversine distance server-side from the raw
   coordinates to the claimed worksite; compare with the stored worksite
   radius and `maxAccuracyMeters`. Client-computed `distanceMeters` /
   `withinGeofence` values are informational only. Outside radius →
   REJECTED (`outside_geofence`) when policy = REJECT; when EXCEPTION,
   accept into an exception queue state ACCEPTED + `rejectionReason` note
   `outside_geofence_exception` (backend decides the approval workflow).
   **The client never gates a punch** (product decision 2026-10): it always
   submits the raw fix (omitting `worksiteId` when unknown) and renders this
   server's verdict — accuracy/radius/policy enforcement lives only here.
7. QR evidence: verify `qrPayload` against the signed worksite code
   (§4.3) — unknown/expired → REJECTED (`invalid_qr` / `expired_qr`).
8. Server time wins: `receivedAt` from the server clock; client clocks are
   evidence only (BRD FR-08 "clock mismatch").
9. Rate limit per employee+route (reuse `lib/external-api/rate-limiter.ts`,
  suggested 10 submissions/min) → HTTP 429 `rate_limited`.
10. Audit: `recordAudit` on every submission (entity `attendance_event`,
    action = resolved `attendanceType`, metadata = method, worksite,
    status, distance — no coordinates in audit metadata beyond necessity).

## 3. Endpoints

All under `/api/mobile/v1/`, `authType: 'mobile'`, employee from token only.
Query parsing uses `context.query` (base handler line 791).

| Method | Path | Purpose |
|---|---|---|
| GET | `/attendance/config` | Allowed methods + company policy (BRD "methods" endpoint) |
| GET | `/attendance/worksites` | The employee's assigned worksites + geofence rules (BRD "locations") |
| GET | `/attendance/status` | Current attendance state + today's punches (drives BRD FR-02 button and §7A dashboard) |
| POST | `/attendance/events` | Submit one attendance event |
| POST | `/attendance/events/sync` | Submit a batch of queued offline events (≤ 20) |
| GET | `/attendance/events` | The employee's own history (`?from=ISO&limit=1..100`, default 30) |
| GET | `/attendance/events/:id` | Authoritative status of one event (client reconcile) |

**Out of contract for the ESS client** (adaptation, documented in
`docs/ESS-PHASE3.md`): the BRD's admin device listing + heartbeat
(`/ess/attendance/devices*`) belong to the framework's tenant admin surface
(`/api/tenant/devices` already models `Device.lastHeartbeat`/`isOnline`), not
to the mobile client. Client-side "device status" (BRD FR-05) is local
capability detection.

### 3.1 `GET /attendance/config`

```jsonc
{ "success": true, "data": {
  "methods": ["GPS", "QR"],            // only methods allowed AND supported by policy
  "policy": {
    "duplicateIntervalSeconds": 120,
    "offlineAllowed": true,
    "geofencePolicy": "REJECT",        // REJECT | EXCEPTION
    "maxAccuracyMeters": 100,
    "lateSyncHours": 24
  },
  "serverTime": "2026-10-22T08:00:00.000Z"
} }
```

### 3.2 `GET /attendance/worksites`

```jsonc
{ "success": true, "data": { "worksites": [
  { "id": "ws_…", "name": "WEHA Retail — Branch Jakarta", "storeId": "st_…",
    "latitude": -6.2088, "longitude": 106.8456,
    "radiusMeters": 100, "maxAccuracyMeters": 100,
    "qrEnabled": true, "isPrimary": true, "isActive": true }
] } }
```

`qrPayload` is **not** returned in this list (see §4.3).

### 3.3 `GET /attendance/status`

```jsonc
{ "success": true, "data": {
  "current": "NOT_STARTED",            // NOT_STARTED | PRESENT | FINISHED
  "expectedNext": "CHECK_IN",          // CHECK_IN | CHECK_OUT | null (finished)
  "today": [ { /* event shape §3.5 */ } ],
  "serverTime": "…"
} }
```

### 3.4 `POST /attendance/events` — single submission

Headers: `Authorization: Bearer <access>`; `Idempotency-Key: <eventId>`
(must equal the body's `idempotencyKey` — header wins on mismatch → 400
`validation`).

Request body (exactly these keys; anything else → 403 `protected_field`):

```jsonc
{
  "eventId": "5f1c9a2b7d3e4f01",        // 16-hex client id (src/lib/id.ts generateId())
  "idempotencyKey": "5f1c9a2b7d3e4f01", // same value; both kept for BRD §5 shape
  "method": "GPS",                      // GPS | QR
  "capturedAt": "2026-10-22T08:01:59.000Z", // client clock, evidence only
  "location": {                         // required when method = GPS
    "worksiteId": "ws_…",
    "latitude": -6.20881, "longitude": 106.84562,
    "accuracyMeters": 12,
    "distanceMeters": 34.5,             // client-computed, informational
    "withinGeofence": true              // client verdict, informational
  },
  "credential": {                       // required when method = QR
    "type": "QR",
    "payload": "WEHAATT:…"              // opaque signed worksite code (§4.3)
  }
}
```

**Never accepted from the client**: `employeeId`, `status`,
`attendanceType`, `receivedAt`, `companyId`, `worksite` coordinates.
An `employeeId`/`status`/`attendanceType` key → 403 `protected_field`
(listing the offending keys in `message`, same convention as the profile
PATCH).

### 3.5 Event result shape (all responses below)

```jsonc
{ "id": "5f1c9a2b7d3e4f01",
  "attendanceType": "CHECK_IN",         // SERVER-resolved; may be null when the
                                        // server rejects BEFORE type assignment
                                        // (e.g. duplicate_interval) — the client
                                        // tolerates null and renders "Punch"
  "method": "GPS",
  "status": "ACCEPTED",                 // ACCEPTED | REJECTED | DUPLICATE
  "recordedAt": "2026-10-22T08:02:15.000Z", // SERVER time the punch counts from
  "receivedAt": "2026-10-22T08:02:01.220Z",
  "worksite": { "id": "ws_…", "name": "WEHA Retail — Branch Jakarta" },
  "distanceMeters": 34.5,               // server-recomputed
  "rejectionReason": null,              // e.g. outside_geofence | invalid_qr | method_not_allowed | stale_capture
  "duplicateOfEventId": null            // set when status = DUPLICATE
}
```

Single submission response: `{ "success": true, "data": { "event": <3.5>,
"serverTime": "…" } }` — HTTP **200 in all business outcomes** (ACCEPTED,
REJECTED and DUPLICATE are results, not transport errors).

### 3.6 `POST /attendance/events/sync` — offline drain

Body: `{ "events": [ <3.4 body>, … ] }`, 1–20 items.
Response: `{ "success": true, "data": { "results": [ <3.5 per event, ordered
as submitted, each carrying its `id`> ], "serverTime": "…" } }`.
Per-event validation is independent — one bad event must not fail the batch.
Rate limit applies to the batch (count each event).

### 3.7 `GET /attendance/events` / `GET /attendance/events/:id`

History: `{ "events": [ <3.5> … ], "serverTime": "…" }` — **scoped to
`context.employeeId`**; no query parameter may target another employee.
Single event: `{ "event": <3.5> }`; unknown id → 404 `not_found`.

## 4. Cross-cutting semantics

### 4.1 Idempotency & replay

- The unique key is `(tenantId, idempotencyKey)` (§1.3). Any retried
  submission with the same key returns the original stored result with
  `status: "DUPLICATE"` + `duplicateOfEventId: <original id>` (equal to the
  id when the client reused `eventId` as key) — HTTP 200.
- This covers scanner double-callbacks, network retries, and offline-queue
  replays (BRD FR-06). Storage of the duplicate attempt for audit is a
  backend option; the original row is authoritative.

### 4.2 Event ids

Client ids are 16-char lowercase hex (`src/lib/id.ts`). The server stores
them as `AttendanceEvent.id` (no server-side id generation for this entity —
required for idempotency across offline capture). Validate the format →
400 `validation`.

### 4.3 QR codes

The backend issues per-worksite QR contents of the form
`WEHAATT:<base64url(JSON)>` where the JSON carries at minimum
`{ "w": "<worksiteId>", "exp": <unix-seconds> }` plus an HMAC the server can
re-verify (signing key = server secret, e.g. derived from
`MOBILE_ACCESS_SECRET`). Codes are printed/placed at the worksite and are
short-lived (suggested ≤ 24 h, renewable via the tenant admin). The client
treats the string as opaque (format guard only) and never parses or logs the
decoded parts; the server validates signature + expiry + worksite activity.

### 4.4 Error responses (transport-level only)

| Case | Status | `error` code |
|---|---|---|
| Missing/invalid/expired token | 401 | `unauthorized` |
| No employee linked / not ACTIVE | 403 | `no_employee` |
| Unknown/forbidden key in body (`employeeId`, `status`, …) | 403 | `protected_field` |
| Malformed body, bad id format, header/body key mismatch, batch > 20 | 400 | `validation` |
| Rate limited | 429 | `rate_limited` |
| Unknown event id | 404 | `not_found` |

Business outcomes (outside geofence, invalid QR, method not allowed,
stale capture, duplicate) are **200 responses with event `status`
REJECTED/DUPLICATE** — never transport errors (BRD FR-07 requires the app to
show the authoritative reason either way).

## 5. Security test matrix (BRD §6/§8 — release-blocking for the backend)

| # | Scenario | Expected |
|---|---|---|
| 1 | Body contains `"employeeId": "<other>"` (or `id`) | 403 `protected_field`; no row; token employee would be used anyway |
| 2 | Body contains `"status": "ACCEPTED"` or `"attendanceType": "CHECK_OUT"` | 403 `protected_field`; no row |
| 3 | Token from tenant A submits with tenant B worksite id | Worksite not found for tenant A → REJECTED `unknown_worksite`; no cross-tenant read |
| 4 | Expired access token | 401 |
| 5 | Spoofed coordinates (distance client-computed small, actual far) | Server recompute → REJECTED `outside_geofence` |
| 6 | Same `idempotencyKey` replayed ×5 (parallel) | Exactly one row; all responses return the original result (`DUPLICATE` after the first) |
| 7 | Check-in accepted, immediate check-in replay within interval (different key) | Folded into original (`DUPLICATE`), no second CHECK_IN |
| 8 | Immediate **check-out** after check-in (different key, inside interval) | **ACCEPTED** — interval must never suppress a check-out |
| 9 | Expired/tampered `qrPayload` | REJECTED `expired_qr` / `invalid_qr` |
| 10 | `GET /attendance/events?employeeId=<other>` | Ignored; returns token employee's data only |
| 11 | Responses never contain `salary`, `nik`, `npwp`, bank fields | Absent (attend­ance selects its own columns) |
| 12 | 100 submissions in 1 minute from one employee | 429 `rate_limited` beyond the configured cap; earlier events unaffected |
| 13 | Direct API call bypassing the UI with a valid token | Identical validation path — no server-side shortcut for "trusted" clients |

Client-side companion assertions (this repo, mocked): requests never include
`employeeId`/`status`/`attendanceType`; `Idempotency-Key` == body
`idempotencyKey` == `eventId`; unknown response fields stripped (zod).

## 6. Backend delivery checklist

1. Prisma models + migration (§1) on the tenant schema.
2. Seven routes (§3) on `createRouteHandler({ authType: 'mobile' })`.
3. Validation pipeline (§2) + idempotency store (§4.1) + QR signer/verifier
   (§4.3) + rate limiting (reuse `lib/external-api/rate-limiter.ts`).
4. Run the §5 matrix as automated tests; attach results to the release.
5. Seed/admin surface: worksite + policy CRUD via the existing tenant admin
   (out of ESS scope) so the client has data to work against.
