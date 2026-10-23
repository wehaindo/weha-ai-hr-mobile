# ESS Phase 5 — Payroll, Payslip & Employee Compensation Self-Service

Records the Phase 5 delivery of the WEHA ESS application: payroll dashboard,
digital payslips with salary breakdown, PPh 21/BPJS information, payroll
history & payment status, and payroll inquiries. The backend interface is
`docs/ESS-PAYROLL-CONTRACT.md` — **implemented in `weha-ai-hrd` (the WEHA HRD
app, port 3278), not `weha-framework`**; the ESS client's
`NEXT_PUBLIC_ERP_BASE_URL` points at the HRD deployment (single backend —
auth/employees endpoints exist there too). BRD: "ESS BRD Phase 5" v1.0.

## 1. Summary

ESS is a **read-only window onto the payroll engine plus an inquiry channel**
(BRD §1/§11): the contract reuses the existing `PayrollPeriod/Run/Result/
Line/Component` models and maps the BRD's statuses onto the real
`PayrollState` workflow — **employees only ever see POSTED+ (published)
payroll**; `PAID` comes solely from a `PayrollPayment` record. Server-side
greenfield work spec'd in the contract: immutable `Payslip`/`PayslipLine`
snapshots (with version/supersedes traceability), server-generated **payslip
PDFs** (decision), `PayrollDocument` (tax files), `PayrollPayment`,
`PayrollInquiry` + message thread, and the payroll notification subscriber.

## 2. What was implemented

| Deliverable | Files | Notes |
|---|---|---|
| Payroll API contract (backend deliverable) | `docs/ESS-PAYROLL-CONTRACT.md` | Targets `weha-ai-hrd`; status-mapping table (§1.1) + POSTED visibility gate; Prisma proposals (Payslip snapshot + lines with `side: EMPLOYEE\|EMPLOYER`, documents, payments, inquiries); 10 endpoints; server-generated PDF semantics (`document_generating`); notification subscriber with no-amounts payloads; 14-case release-blocking security matrix |
| Navigation | `src/app/nav.config.ts`, `src/lib/ess/widgets/services.ts` | New **Payslips** nav entry (route gated by `ess.use`); `payslips` service shortcut `coming` → `available` |
| Payroll API client | `src/integration/ess/payroll.ts` | `EssPayrollApi` over the shared core: summary/periods/payments/payslip/PDF/documents(+download)/inquiries(+messages) — zod `.strip()`, **money stays Decimal strings**, multipart inquiry submit with idempotency key, `domainCode` for `document_generating`/`status_conflict` |
| Domain | `src/lib/ess/payroll/{money,view-model,download}.ts` | `formatIdr` (Intl id-ID, deterministic "Rp…" prefix — ICU currency spacing avoided), signed variant for deductions; status/category label maps with completeness guard; base64→Blob save helper; print isolation CSS in `globals.css` |
| Hooks | `src/hooks/{usePayroll,usePayslip,useInquiries}.ts` | Phase 2/3 conventions (state machine, session-expiry, no local persistence — BRD §6.1/§8.12) |
| Payslips page | `src/app/payslips/page.tsx` + `src/components/ess/payroll/*` | Summary card (BRD §5.1), tabs: **Payslips** (history + detail dialog with Earnings / Deductions / Employee contributions / Employer contributions / Summary / Payment sections, IDR formatted, Download PDF + Print, revised-payslip notice), **Tax & BPJS** (released documents + download + remittance disclaimer), **Inquiries** (list, form with category/period/attachments, detail thread with reply while open) |
| Dashboard | `src/components/ess/widgets/payroll-summary-widget.tsx`, `registry.ts` | 5th widget: latest published net + status; unpublished → "No published payslip yet" (never numbers) |

Tests: **31 new unit tests** (payroll-client 12, money 6, view-model 3,
+ registry/permission updates) and **11 new e2e**
(`tests/e2e/ess-payslips.spec.ts` 7, `ess-inquiries.spec.ts` 4) against a
stateful mock (`tests/e2e/helpers/payroll-mock.ts`) including a deliberate
`salary` leak probe that must be stripped.

## 3. Adaptations vs the BRD

- **Paths**: BRD §6.3 `/api/ess/payroll/*` → `/api/mobile/v1/ess/payroll/*`.
- **Status mapping** (contract §1.1): the BRD's `PUBLISHED/FINALIZED/
  PAYMENT_PENDING` are *derived* from `PayrollState` (`POSTED`/`CLOSED`) +
  `PayrollPayment` — no duplicate status columns; `PROCESSING/APPROVED`
  amounts remain invisible to employees.
- **Payslip PDF** = server-generated artifact (confirmed decision) downloaded
  via base64-JSON (the device transport is JSON-only); the client adds a
  print-friendly on-screen view (`window.print()` with scoped print CSS).
- **Inquiries** use dedicated tables + an HR message thread — not the
  approval engine (no multi-step routing needed for BRD §4.6).
- **Notifications** (§4.7/§5.7): server delivery only (contract §4); the
  client surfaces outcomes via payslip/inquiry status — no inbox UI this
  phase (same scope call as Phase 4).
- **Tax/BPJS tabs** live under the single `/payslips` route (segmented tabs)
  rather than new top-level routes; money is formatted client-side from
  Decimal strings, YTD sums are server-computed (BRD §7).
- **Manager/HR roles** (BRD §5): employee-scoped ESS reads only; HR/payroll
  admin surfaces belong to the tenant admin (out of client scope);
  authorization is backend-enforced (contract §5 matrix).

## 4. Acceptance evidence (BRD §10)

Status: ✅ delivered & verified here · ✅/⏳ client done, **real integration
pending backend** · ⏳ pending backend (release-blocking) · ⛔ env-blocked.
Mocked tests are not production proof (BRD convention from prior phases).

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Employees view published payroll summary + historical payslips | ✅/⏳ | `/payslips` summary + history (e2e `ess-payslips` #1/#5); backend endpoints pending |
| 2 | Payslips show correct gross, deductions, net from finalized records | ✅/⏳ | Detail sections render server totals; zod strips leak probes (unit + e2e #5); accuracy of payroll values is backend-owned |
| 3 | Employee vs employer BPJS shown separately | ✅/⏳ | Separate `employeeContributions`/`employerContributions` sections (contract §2 `side`, e2e #5) |
| 4 | PPh 21 + released tax documents authorized-only | ✅/⏳ | PPh 21 as a deductions line + Tax tab with RELEASED-only list (contract §3); owner/IDOR enforcement ⏳ |
| 5 | Employees download and print payslips securely | ✅ | Server PDF download (e2e #6/#7 incl. `document_generating`) + scoped print view (CSS + Print button) |
| 6 | Employees submit inquiries and track responses | ✅/⏳ | Form + multipart (e2e inquiries #1), thread + reply (#3), closed state (#4); server status rules pending |
| 7 | Publication/payment notifications delivered via configured channels | ⏳ | Contract §4 subscriber (Notification + WHOTIF, no amounts) |
| 8 | ID/URL/parameter changes cannot expose others' records | ⏳ | Contract §5 matrix rows 1/4/5 (release-blocking) |
| 9 | Tenant isolation, document controls, audit logging pass security testing | ⏳ | Contract §5 rows 10/12 (audit without amounts) |
| 10 | PWA + Android layouts pass the device matrix | ✅/⛔ | PWA verified on Chromium (57/57 e2e); **Android SDK-blocked** (same env blocker as Phases 1–4) |

HR/payroll stakeholder sign-off (BRD §10 last item) is an organizational
step — statutory outputs must be validated by the payroll team (BRD §12).

### Verification (all green at handover)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| `npm run test:run` | **53 files / 402 tests pass** |
| `NODE_ENV=production npm run build` | pass — 35 static pages |
| `npx playwright test` | **57 tests pass** (46 pre-existing + 11 Phase 5) |

## 5. Open items / next phase

1. **Backend build** of `docs/ESS-PAYROLL-CONTRACT.md` in `weha-ai-hrd` —
   models, publication hook (snapshot + PDF generation + notification),
   the 10 routes, rate limits/audits — then re-run the e2e specs against a
   real deployment (set `NEXT_PUBLIC_ERP_BASE_URL` to the HRD deployment)
   and promote the ⏳ items. The §5 matrix is release-blocking.
2. Payroll-team validation of payslip/PDF/statutory rendering (BRD §12).
3. Android release pass (SDK-blocked): PDF open/share via WebView,
   print sheet, on-device layout matrix.
4. Optional follow-ups: notifications inbox UI, payslip year picker beyond
   the current filter, revised-payslip push prominence.
