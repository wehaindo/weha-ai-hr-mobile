# ESS Dummy Data — preview every screen before the backend exists

A built-in preview mode that answers every ESS API call from a local JSON
fixture, so the whole application can be explored with realistic data while
`weha-ai-hrd` is being developed on another machine. When the real backend
is ready you switch it on by **removing one env var — no code changes**.

## 1. Enable / disable

```bash
# .env.local (see .env.example)
NEXT_PUBLIC_ESS_DUMMY=1     # preview ON — fixture answers all ESS calls
```

Restart `npm run dev` (the flag is inlined at build/dev time).

| Flag | Behavior |
|---|---|
| `NEXT_PUBLIC_ESS_DUMMY=1` | Every `/api/mobile/v1/*` call — login, profile, attendance, requests, approvals, manager, payroll — is answered from `src/mocks/ess-dummy-data.json`. All other URLs (ERP sync, Data Hub, AI) still go to the network. |
| unset (default) | Zero dummy code executes (the fixture is a lazy `import()`, not bundled); the app calls `NEXT_PUBLIC_ERP_BASE_URL` for real. |

**Going live (when weha-ai-hrd is ready):**
1. Delete/comment `NEXT_PUBLIC_ESS_DUMMY` in `.env.local`.
2. Set `NEXT_PUBLIC_ERP_BASE_URL` to the HRD deployment (dev: `http://localhost:3278`).
3. Rebuild/restart. The contract for that backend is
   `docs/ESS-API-REFERENCE.md`.

## 2. What you can preview (dummy login: `budi@example.com`, any password)

| Screen | Fixture highlights |
|---|---|
| Login / session | Dummy mobile session (tokens + identity) — sign in works offline |
| Dashboard | Employee summary, payroll + requests widgets, service shortcuts |
| Profile | Full employee record with company/department relations |
| Attendance | Config/worksites/status; a GPS punch (browser location permission → inside the HQ geofence) appends to today and flips the state to PRESENT |
| Leave | 3 leave types (half-day + attachment rules), 3 balances incl. pending, working-day preview; submitting appends the new request to history |
| Requests | 6 requests across SUBMITTED / RETURNED / APPROVED / CANCELLED with timelines, return reasons and an attachment; cancel & resubmit mutate the row |
| Approvals | Inbox with an overdue badge + filters (type/overdue/search); leave detail shows **balance + overlapping request**; correction detail shows **original punch + conflict flags**; approving removes the item; delegations dialog |
| Manager | 4 stat cards, team with mixed today-attendance (incl. "Not yet calculated") + search; no salary/personal fields anywhere |
| Payslips & payroll | 6-month history (PAID/FINALIZED/PUBLISHED), rich payslip with separated earnings/deductions/employee+employer BPJS + IDR formatting, PDF & tax-document downloads (dummy files), inquiry thread with HR replies (replying appends) |

## 3. How it works

- **Seam**: `src/platform/renderer-bridge.ts` → `cloud.request` checks the
  flag first and routes matching URLs to `matchDummyApi()`
  (`src/mocks/dummy-api.ts`) — the single transport every ESS client and
  mobile auth already use, which is why login works without a server.
- **Fixture**: `src/mocks/ess-dummy-data.json` — pure data. Edit it to
  experiment; shapes follow `docs/ESS-API-REFERENCE.md` (same envelope,
  Decimal amounts as strings).
- **Router** (`dummy-api.ts`): serves the ~40 endpoints the client calls;
  parameterized paths resolve from the fixtures; unknown mobile paths return
  an honest `404 "No dummy fixture for METHOD /path"` (gaps are visible,
  never hangs).
- **Light overlays** (reset on page reload): submissions append to
  history/inquiries, approval decisions empty the inbox, punches append to
  today — so create/decide flows visibly update the UI.

## 4. Limitations

- **Resets on reload** — overlays live in memory only; the JSON is the truth.
- **Browser/PWA dev only** — the Electron preload does not intercept (no
  dummy mode in `npm run electron:dev`); Android builds use the real API.
- ERP sync / Data Hub / realtime still try their real URLs (not part of
  `/api/mobile/v1`) — their errors on the Sync/Diagnostics screens are
  expected in preview mode.
- Approvals `nextCursor` is always null (no pagination demo with 2 items);
  PDFs/documents download tiny dummy files.
- Never ship a build with the flag set: `.env.example` documents it as a
  dev-only switch, and CI/capacitor scripts do not define it.
