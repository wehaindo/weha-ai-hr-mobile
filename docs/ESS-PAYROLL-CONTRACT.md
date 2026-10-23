# ESS Payroll API Contract — for the WEHA HRD backend

Target implementation: **`weha-ai-hrd`** — the WEHA HRD application
(`D:\NextjsProjects\weha-ai-hrd`, dev port **3278**; `package.json` name is
"weha-framework" — it is the framework codebase extended with the payroll and
compensation modules). It hosts the same mobile API and conventions as the
framework (`app/api/mobile/v1/*`, `lib/base-route-handler.ts`,
`lib/mobile-api-auth.ts`), so the ESS client keeps a **single backend**: set
`NEXT_PUBLIC_ERP_BASE_URL` to the HRD deployment (auth + employees/me exist
there too). The ESS client team never modifies the backend repo; this
document is the interface. Companions: `docs/ESS-API-CONTRACT.md` (profile),
`docs/ESS-ATTENDANCE-CONTRACT.md`, `docs/ESS-REQUESTS-CONTRACT.md`.

All routes: `createRouteHandler({ authType: 'mobile' })` (employee =
`context.employeeId`, never a request value), `{success,data}` envelope,
`MOBILE_CORS_HEADERS`, rate limiting via `lib/external-api/rate-limiter.ts`,
audit via `recordAudit`. **Amounts cross the wire as Decimal strings**
(Prisma `Decimal(18,2)` → JSON strings; no floats anywhere — BRD §7).

## 1. Reuse — the payroll engine already exists

| Existing model | Use for ESS Phase 5 |
|---|---|
| `PayrollPeriod` (code, startDate/endDate, **paymentDate**, `state: PayrollState`) | Pay period + publication/payment state |
| `PayrollRun` (state, `postedAt`) | A calculation pass; **POSTED = published** |
| `PayrollResult` (basicSalary/grossSalary/totalDeduction/employerCost/netSalary `Decimal(18,2)`, `calculationData Json`) | Per-employee totals for a posted run |
| `PayrollLine` (componentId, amount, quantity/rate, calculationDetail) | Component breakdown |
| `PayrollComponent` (type, `category: FIXED_EARNING\|VARIABLE_EARNING\|DEDUCTION\|STATUTORY\|REIMBURSEMENT\|THR`, taxable) | Line classification for the payslip sections |
| `NumberingSequence` (`PAYSLIP`, `PAYDOC`, `PAYINQ` rows to seed) | Payslip/document/inquiry numbers |
| `FileAttachment` (entityType/entityId/key) | Payslip PDF artifact, tax documents, inquiry attachments |
| `Notification` + the Phase 4 event-subscriber pattern | Payroll notifications (§5) |

### 1.1 Status mapping (BRD §4.1 → the actual workflow)

The employee-facing status is derived — never stored twice:

| Employee status | Source (PayrollState / data) |
|---|---|
| *(nothing visible)* | period/run state < `POSTED` — **unpublished amounts are never exposed** (BRD §4.1) |
| `PUBLISHED` / awaiting payment | `POSTED`, no `PayrollPayment` row (≡ BRD `PAYMENT_PENDING`) |
| `PAID` | `POSTED` **and** a `PayrollPayment` row exists for (period, employee) — ESS never marks paid itself (BRD §4.5) |
| `FINALIZED` | `CLOSED` (run/period closed after payment) |
| `CANCELLED` | `CANCELLED` — amounts withheld, payslip (if any) retained for traceability |

`PROCESSING`/`APPROVED` (BRD lifecycle names) ≈ `PROCESSING`/`APPROVED` in
`PayrollState` but remain **invisible** to employees until POSTED. If
`PayrollState` evolves, this table is the contract to revisit.

## 2. Proposed Prisma additions (tenant schema, employee-scoped)

```prisma
enum PayslipSide { EMPLOYEE EMPLOYER }
enum PayrollDocumentType { PPH21_SUMMARY PPH21_1721_A1 BPJS_STATEMENT OTHER }
enum PayrollDocumentStatus { DRAFT RELEASED }
enum PayrollInquiryCategory {
  SALARY_DISCREPANCY MISSING_ALLOWANCE_OVERTIME INCORRECT_DEDUCTION
  PPH21_INQUIRY BPJS_INQUIRY LOAN_REIMBURSEMENT MISSING_PAYSLIP_TAX_DOC OTHER
}
enum PayrollInquiryStatus { SUBMITTED IN_PROGRESS RESOLVED CLOSED }
enum InquiryAuthorRole { EMPLOYEE HR }

model Payslip {                // immutable publication snapshot (BRD §4.2)
  id             String  @id @default(cuid())
  number         String  @unique                       // NumberingSequence "PAYSLIP"
  payrollResultId String @unique                       // 1 per posted result
  periodId       String
  employeeId     String
  version        Int     @default(1)
  supersedesId   String?                                // revised payslip → original kept
  publishedAt    DateTime
  pdfKey         String?                                // FileAttachment key of the PDF artifact
  createdAt      DateTime @default(now())
  lines          PayslipLine[]
  @@index([employeeId, periodId])
}

model PayslipLine {            // copy of PayrollLine + component snapshot
  id           String        @id @default(cuid())
  payslipId    String
  componentId  String
  code         String                                        // snapshot
  name         String                                        // snapshot
  category     PayrollComponentCategory                      // snapshot
  type         PayrollComponentType                          // snapshot
  taxable      Boolean
  side         PayslipSide                                   // EMPLOYEE | EMPLOYER
  amount       Decimal         @db.Decimal(18, 2)
  quantity     Decimal?        @db.Decimal(12, 4)
  rate         Decimal?        @db.Decimal(18, 6)
  @@index([payslipId])
}

model PayrollDocument {
  id         String               @id @default(cuid())
  number     String?                                        // NumberingSequence "PAYDOC"
  employeeId String
  type       PayrollDocumentType
  taxYear    Int?
  periodId   String?
  status     PayrollDocumentStatus @default(DRAFT)
  fileKey    String                                       // FileAttachment key
  releasedAt DateTime?
  createdAt  DateTime             @default(now())
  @@index([employeeId, status])
}

model PayrollPayment {         // the ONLY source of PAID
  id         String   @id @default(cuid())
  periodId   String
  employeeId String?                                       // null = period-level payment
  paidAt     DateTime
  reference  String?
  method     String?
  createdAt  DateTime @default(now())
  @@unique([periodId, employeeId])
  @@index([employeeId])
}

model PayrollInquiry {         // NOT the approval engine — an HR thread (BRD §4.6)
  id             String               @id @default(cuid())
  number         String               @unique              // NumberingSequence "PAYINQ"
  employeeId     String
  companyId      String
  periodId       String?                                  // must reference a posted period
  category       PayrollInquiryCategory
  subject        String
  description    String               @db.Text
  status         PayrollInquiryStatus @default(SUBMITTED)
  resolvedAt     DateTime?
  idempotencyKey String
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  messages       PayrollInquiryMessage[]
  @@unique([employeeId, idempotencyKey])
  @@index([employeeId, status])
}

model PayrollInquiryMessage {
  id        String            @id @default(cuid())
  inquiryId String
  authorRole InquiryAuthorRole
  authorId  String
  message   String            @db.Text
  createdAt DateTime          @default(now())
  @@index([inquiryId])
}
```

**Attachment derivation** (BRD §4.2/§7): the PDF artifact is a
`FileAttachment` row (`entityType = "Payslip"`, `entityId = payslipId`);
tax documents and inquiry attachments use `entityType = "PayrollDocument"` /
`"PayrollInquiry"`.

**Line `side` derivation** (BRD §4.4 employee/employer separation):
`DEDUCTION`/`REIMBURSEMENT`-paid-by-employee → `EMPLOYEE`; `FIXED_EARNING`,
`VARIABLE_EARNING`, `THR` → `EMPLOYEE` earnings; BPJS/`STATUTORY` components
→ `EMPLOYER` when the component config marks the employer portion, otherwise
`EMPLOYEE`. Backend adds a `statutorySide` flag on `PayrollComponent` (or
derives from the component code list) — the payslip builder must never guess:
unresolved STATUTORY lines default to `EMPLOYEE` and are logged.

## 3. Endpoint contract (`/api/mobile/v1/ess/payroll/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/summary` | BRD §5.1 dashboard |
| GET | `/periods?year=YYYY` | BRD §4.5 history |
| GET | `/periods/:periodId/payslip` | BRD §4.2/§4.3 payslip + breakdown |
| GET | `/periods/:periodId/payslip/pdf` | **server-generated PDF** (base64 JSON) |
| GET | `/documents?year=YYYY` | BRD §4.4 tax/payroll document list |
| GET | `/documents/:documentId/download` | authorized base64 download |
| GET | `/payments` | BRD §4.5 payment history |
| POST | `/inquiries` | BRD §4.6 submit (multipart `request` + `files[]`, Phase 4 shape: ≤3 × 5 MB images/PDF) |
| GET | `/inquiries?year=` / `/inquiries/:id` | list / detail with `messages` thread |
| POST | `/inquiries/:id/messages` | employee follow-up while `status != CLOSED` |

### 3.1 `GET /summary`

```jsonc
{ "success": true, "data": {
  "published": true,                    // false → nothing posted yet; NO amounts in the payload
  "latest": {
    "periodId": "…", "periodCode": "2026-09", "periodLabel": "September 2026",
    "netSalary": "10250000.00",         // Decimal string
    "paymentStatus": "PAID",            // PUBLISHED | PAID | FINALIZED | CANCELLED (§1.1)
    "paymentDate": "2026-09-27",        // nullable
    "payslipNumber": "PAYSLIP-2026-000123",
    "hasPayslip": true
  },
  "ytd": { "gross": "102500000.00", "deductions": "12500000.00" },  // server-computed
  "releasedDocumentCount": 1,
  "openInquiryCount": 0,
  "serverTime": "…"
} }
```

### 3.2 `GET /periods` / `GET /payments`

```jsonc
// periods
{ "periods": [ { "periodId": "…", "periodCode": "2026-09", "periodLabel": "September 2026",
  "netSalary": "10250000.00", "paymentStatus": "PAID", "paymentDate": "2026-09-27",
  "payslipNumber": "PAYSLIP-2026-000123", "hasPayslip": true } ] }
// payments
{ "payments": [ { "periodId": "…", "periodLabel": "September 2026",
  "paidAt": "2026-09-27", "reference": "TRF-8871", "method": "TRANSFER" } ] }
```

### 3.3 `GET /periods/:periodId/payslip`

```jsonc
{ "success": true, "data": { "payslip": {
  "payslipId": "…", "number": "PAYSLIP-2026-000123", "version": 1,
  "supersedesNumber": null,            // revised payslips point at the original (BRD §4.2)
  "publishedAt": "…",
  "employee": { "employeeNumber": "EMP-007", "name": "Budi Santoso",
    "company": "WEHA Retail", "department": "Operations", "position": "Store Supervisor" },
  "period": { "periodId": "…", "periodLabel": "September 2026", "paymentDate": "2026-09-27" },
  "payment": { "status": "PAID", "paidAt": "2026-09-27", "reference": "TRF-8871" },
  "earnings":    [ { "code": "BASIC", "name": "Basic salary", "category": "FIXED_EARNING", "amount": "10000000.00" } ],
  "deductions":  [ { "code": "PPh21", "name": "PPh 21", "category": "STATUTORY", "amount": "450000.00" } ],
  "employeeContributions": [ { "code": "BPJS_KES_EMP", "name": "BPJS Kesehatan (employee)", "category": "STATUTORY", "amount": "100000.00" } ],
  "employerContributions": [ { "code": "BPJS_KERJA_ER", "name": "BPJS Ketenagakerjaan (employer)", "category": "STATUTORY", "amount": "176000.00" } ],
  "summary": { "gross": "10700000.00", "totalDeductions": "550000.00",
    "netSalary": "10250000.00", "employerCost": "10876000.00" },
  "pdf": { "available": true, "generating": false }
} } }
```

Every line group carries `{code, name, category, amount}` (BRD §4.2/§4.4 —
employer contributions **separately** from employee deductions). PPh 21 is a
normal `DEDUCTIONS` line (shown per payslip, BRD §4.4).

### 3.4 PDF & document downloads (base64 JSON — transport parity)

- `GET /periods/:periodId/payslip/pdf` →
  `{ "success": true, "data": { "file": { "base64": "…", "fileName":
  "PAYSLIP-2026-000123.pdf", "mimeType": "application/pdf" } } }`.
  The PDF is **generated asynchronously at publication** (worker or
  post-post hook), stored via `FileAttachment`. Not ready → HTTP 404 with
  `{ "error": "document_generating" }`; generation failure → retry on next
  request (regenerate with backoff; never expose storage paths). PDF content:
  A4, IDR amounts, identity/period/sections/summary per §3.3 + footer
  "Generated by WEHA HRD".
- `GET /documents` → `{ "documents": [ { "documentId", "number", "type",
  "taxYear", "periodLabel", "status": "RELEASED", "releasedAt", "fileName",
  "size" } ] }` — **only RELEASED + own employee**.
- `GET /documents/:documentId/download` → same `{file}` shape as the PDF.

### 3.5 Inquiries

- `POST /inquiries` — multipart (`request` JSON + `files[]`, Phase 4 rules).
  `request` keys exactly: `{ idempotencyKey, category, periodId?, subject,
  description }` (anything else → 403 `protected_field`). `periodId` must
  reference a **posted** period of the employee. Idempotent replay → return
  the original inquiry (200). Response `{ inquiry: <3.6> }`.
- `GET /inquiries` → `{ inquiries: [ <3.6 list projection> ] }`;
  `GET /inquiries/:id` → `{ inquiry: <3.6 + messages + attachments> }` (404
  for other employees).
- `POST /inquiries/:id/messages` — `{ message }` (text, 1–2000 chars);
  allowed while `status != CLOSED`; the employee's message does **not**
  change status (HR moves SUBMITTED→IN_PROGRESS→RESOLVED→CLOSED server-side).

### 3.6 Inquiry projection

```jsonc
{ "inquiryId": "…", "number": "PAYINQ-2026-000042",
  "category": "INCORRECT_DEDUCTION", "periodId": "…", "periodLabel": "September 2026",
  "subject": "Deduction looks wrong", "status": "IN_PROGRESS",
  "submittedAt": "…", "resolvedAt": null, "attachmentCount": 1,
  "attachments": [ { "id": "…", "fileName": "bukti.pdf", "mimeType": "application/pdf", "size": 1234 } ],
  "messages": [ { "authorRole": "EMPLOYEE", "authorName": "Budi Santoso",
      "message": "…", "createdAt": "…" },
    { "authorRole": "HR", "authorName": "Sari Admin",
      "message": "Checking with payroll.", "createdAt": "…" } ] }
```

## 4. Notification subscriber (BRD §4.7)

A subscriber on payroll/lifecycle events writes `Notification` rows (and
optionally POSTs to the configured WHOTIF URL/token):

| Event | When | Recipient |
|---|---|---|
| `payslip.published` | Payslip snapshot + PDF created at POST | employee |
| `payroll.paid` | `PayrollPayment` created / period → PAID | employee |
| `tax_document.released` | `PayrollDocument.status → RELEASED` | employee |
| `payslip.revised` | New version supersedes | employee |
| `inquiry.updated` / `inquiry.resolved` | HR message / status change | employee (+ HR queue for new inquiries) |

**Payload rule (BRD §4.7)**: title/message carry period labels, numbers and
document types only — **never salary, tax or BPJS amounts**, in rows or push
previews.

## 5. Security test matrix (BRD §8/§10 — release-blocking)

| # | Scenario | Expected |
|---|---|---|
| 1 | Employee A requests payslip/period of employee B (parameter tampering) | 404 — everything keyed from `context.employeeId` |
| 2 | Period still `CALCULATED`/`APPROVED` (unpublished) | `/summary` → `published:false` with NO amounts; `/periods` excludes it; payslip → 404 |
| 3 | `PAID` shown without a `PayrollPayment` row | impossible — status derived (§1.1); fuzz each state |
| 4 | PDF/document download by a non-owner | 404; audit row records the attempt |
| 5 | Tax document in `DRAFT` | not listed, not downloadable |
| 6 | Replay `POST /inquiries` ×5 same idempotencyKey | ONE inquiry + one number |
| 7 | Inquiry with another employee's `periodId` | 400 `validation` (not an own posted period) |
| 8 | Message posted to a `CLOSED` inquiry | 409 `status_conflict` |
| 9 | Client sends `netSalary`/`status`/`paidAt` in an inquiry | 403 `protected_field` |
| 10 | Cross-tenant token | payroll rows of other tenants unreachable (JWT tenant → db) |
| 11 | Logs/notifications contain salary amounts | absent (grep the log/notification fixtures in tests) |
| 12 | Audit rows exist for payslip view, PDF download, document download, inquiry create/message — metadata **without amounts** | asserted |
| 13 | Rate limits: reads 30/min, downloads 10/min, inquiries 10/hr per employee | 429 `rate_limited` beyond |
| 14 | Revised payslip (v2) | original v1 retrievable for traceability; `supersedesNumber` set (BRD §4.2) |

Client-side companion assertions (this repo, mocked): responses zod-stripped
(no unexpected fields survive), inquiry submits carry only allowlisted keys +
`Idempotency-Key`, amounts rendered from strings without arithmetic.

## 6. Backend delivery checklist

1. Prisma models (§2) + migration; seed numbering rows `PAYSLIP`, `PAYDOC`,
   `PAYINQ`; `statutorySide` derivation for components.
2. The publication hook: at `POSTED`, build the immutable `Payslip` +
   `PayslipLine` snapshot, enqueue PDF generation, emit
   `payslip.published`; on payment → `PayrollPayment` + `payroll.paid`.
3. The 10 routes (§3) on `createRouteHandler({ authType: 'mobile' })`;
   rate limits + audits (metadata ids only).
4. Notification subscriber (§4) incl. the no-amounts payload rule.
5. Run the §5 matrix as automated tests; validate PDF output with the
   payroll team (BRD §12 statutory accuracy).
6. HR/admin surfaces (payments recording, document release, inquiry
   assignment) live in the tenant admin — out of ESS scope but required.

## 7. Documented adaptations vs the BRD

- BRD §6.3 paths `/api/ess/payroll/*` → `/api/mobile/v1/ess/payroll/*`.
- BRD statuses mapped onto `PayrollState` + `PayrollPayment` (§1.1) — no
  duplicate status columns.
- Payslip "downloadable PDF" = **server-generated artifact** (decision);
  the client also renders a print-friendly on-screen view, but the PDF of
  record is the server file.
- `Payslip`/`PayslipLine` are publication snapshots — later payroll edits
  create a new version, never mutation (BRD §4.2 immutability).
- Inquiries use dedicated tables + an HR message thread, **not** the
  approval engine (no multi-step routing needed for §4.6).
- Notifications: server delivery (WHOTIF/Notification rows); the ESS client
  surfaces outcomes through payslip/inquiry status — no notifications inbox
  UI in this phase.
