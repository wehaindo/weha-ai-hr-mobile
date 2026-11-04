# ESS Performance-Review Contract (mobile ↔ weha-ai-hrd)

Client implementation: `src/integration/ess/performance.ts` +
`/performance` screen. Backend: `weha-ai-hrd`
(`app/api/mobile/v1/talent/*`, `lib/talent/ess-service.ts`,
`lib/performance/ess-service.ts`). Same envelope, auth, CORS and rate-limit
conventions as every `/api/mobile/v1` route (`docs/ESS-API-REFERENCE.md §0`):
Bearer mobile JWT, employee id always from the token, `{"success":…}`.

## 1. Endpoints

| # | Method | Path | Body | Returns |
|---|---|---|---|---|
| 1 | GET | `/talent/performance` | — | `{ summary: Summary \| null, trend: Trend[] }` |
| 2 | GET | `/talent/reviews` | — | `{ items: Review[] }` (≤50) |
| 3 | GET | `/talent/reviews/:id` | — | `{ review: Review }` (403 when not yours, 404 unknown) |
| 4 | POST | `/talent/reviews/:id/self-assessment` | `{ responses: CriterionResponse[], comments? }` | `{ review }` (409 unless state `SELF_ASSESSMENT`) |
| 5 | POST | `/talent/reviews/:id/acknowledge` | — | `{ review }` (409 unless state `FINALIZED`) |

No `Idempotency-Key`; submissions are guarded by review state + ownership.

## 2. Shapes

```jsonc
// Summary — the employee's LATEST PUBLISHED result (published on acknowledgement)
{ "id": "…", "revision": 2, "publishedAt": "ISO", "reviewId": "…",
  "reviewState": "ACKNOWLEDGED",
  "cycle": { "name": "H1 2026", "periodStart": "2026-01-01", "periodEnd": "2026-06-30" },
  "overallScore": 82.4, "rating": "A", "ratingLabel": "Exceeds expectations",
  "strengths": ["…"], "improvementAreas": ["…"],      // strings or {label|title|text}
  "recommendations": [ { "id": "…", "title": "…", "description": "…",
                         "kind": "TRAINING", "priority": "MEDIUM" } ],  // PUBLISHED only
  "selfScore": 80, "managerScore": 84, "previousScore": 78.5, "kpiAchievement": 90,
  "employeeComments": "…", "managerComments": "…", "hrComments": "…" }

// Trend entry — released history; comparable=false when the methodology changed
{ "reviewId": "…", "cycleName": "H1 2026", "periodEnd": "2026-06-30",
  "score": 82.4, "ratingLabel": "Exceeds", "delta": 3.9,
  "comparable": true, "reason": "only when comparable=false" }

// Review
{ "id": "…", "state": "SELF_ASSESSMENT",
  "cycle": { "code": "H2-2026", "name": "H2 2026 Review", "state": "OPEN",
             "periodStart": "2026-07-01", "periodEnd": "2026-12-31" },
  "reviewer": { "displayName": "…" }, "secondaryReviewer": null,
  "assignments": [ { "stage": "SELF", "state": "PENDING", "dueAt": "ISO" } ],
  "responses": [ { "assignmentId": "…", "criterionKey": "attendance",
                   "score": 4, "maxScore": 5, "notApplicable": false,
                   "comment": "…" } ],                       // own assignments only
  "templateVersion": { "allowMissing": false,
    "criteria": [ { "key": "attendance", "label": "Attendance", "weight": 40,
                    "maxScore": 5, "mandatory": true, "isScored": true,
                    "requiresEvidence": false,
                    "scoreLabels": [ { "score": 4, "label": "Exceeds" } ] } ] },
  "finalizedAt": null, "acknowledgedAt": null, "version": 3 }
```

**States:** `DRAFT → SELF_ASSESSMENT → MANAGER_REVIEW → SECONDARY_REVIEW →
CALIBRATION → FINALIZED → ACKNOWLEDGED → CLOSED` (+ `CANCELLED`).
The employee can act only in `SELF_ASSESSMENT` (submit) and `FINALIZED`
(acknowledge). Acknowledging publishes the summary — the only path that makes
it visible (`summary` is `null` before that).

## 3. Self-assessment body

```jsonc
{ "responses": [
    { "criterionKey": "attendance", "score": 4, "comment": "…" },
    { "criterionKey": "notes", "score": null, "comment": "Evidence" }
  ],
  "comments": "Overall remarks" }
```

Server validation: every `criterionKey` must exist in the review's frozen
template; no duplicates; `0 ≤ score ≤ maxScore`; mandatory criteria need a
score unless the template sets `allowMissing: true`; `notApplicable: true`
only for scored questions (drops the weight from the denominator).
The client mirrors this before submitting (inline error, no request).

## 4. Client-side rules (this app)

- Screen `/performance` (permission `ess.use`; sidebar + More sheet): published
  summary, trend (`comparable:false` rendered honestly, never a delta),
  review list; review detail opens in a dialog (static export ⇒ no dynamic
  routes).
- Reads are safe at any time; the UI reflects `no_session` for local (PIN)
  accounts and never calls the talent routes without a mobile session.
- On submit/acknowledge the list + summary reload (state changed server-side).
- Redaction is server-side: the app never receives other reviewers'
  confidential comments, calibration notes or raw calculation snapshots.

## 5. Verification

- Unit: `__tests__/ess/performance-client.test.ts` (parsing, allowlisted body,
  409, contract drift).
- E2E: `tests/e2e/ess-performance.spec.ts` + `helpers/performance-mock.ts`
  (summary/trend, self-assessment submit, acknowledge, mandatory validation,
  no-session).
- Live: `npm run smoke:live -- --base … --tenant … --email … --password …`
  covers `GET /talent/performance` and `GET /talent/reviews` (reads).
