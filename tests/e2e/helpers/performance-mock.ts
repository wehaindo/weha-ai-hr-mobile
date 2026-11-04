import type { Page } from '@playwright/test';
import { CORS_HEADERS } from './ess-mock';

// Mocks `/api/mobile/v1/talent/*` (performance summary + reviews). Register
// AFTER mockEssApi (its catch-all answers everything else).

export const PERFORMANCE_SUMMARY = {
  id: 'sum-1',
  revision: 2,
  publishedAt: '2026-07-15T03:00:00.000Z',
  reviewId: 'rev-published',
  reviewState: 'ACKNOWLEDGED',
  cycle: { name: 'H1 2026 Review', periodStart: '2026-01-01', periodEnd: '2026-06-30' },
  overallScore: 82.4,
  rating: 'A',
  ratingLabel: 'Exceeds expectations',
  strengths: ['Reliable shift coverage'],
  improvementAreas: ['Document handover notes earlier'],
  recommendations: [{ id: 'rec-1', title: 'Advanced retail training', description: 'Q4 cohort' }],
  selfScore: 80,
  managerScore: 84,
  previousScore: 78.5,
  kpiAchievement: 90,
  managerComments: 'Consistent performer.',
};

export const PERFORMANCE_TREND = [
  { reviewId: 'rev-published', cycleName: 'H1 2026 Review', periodEnd: '2026-06-30', score: 82.4, ratingLabel: 'Exceeds', delta: 3.9, comparable: true },
  { reviewId: 'rev-older', cycleName: 'Annual 2025', periodEnd: '2025-12-31', score: 78.5, ratingLabel: 'Meets', delta: null, comparable: false, reason: 'Methodology changed' },
];

const CRITERIA = [
  {
    key: 'attendance',
    label: 'Attendance & punctuality',
    weight: 40,
    maxScore: 5,
    mandatory: true,
    isScored: true,
    scoreLabels: [
      { score: 3, label: 'Meets expectations' },
      { score: 4, label: 'Exceeds' },
      { score: 5, label: 'Outstanding' },
    ],
  },
  { key: 'customer', label: 'Customer handling', weight: 40, maxScore: 5, mandatory: true, isScored: true },
  { key: 'notes', label: 'Examples this cycle', weight: 0, maxScore: 0, mandatory: false, isScored: false, requiresEvidence: true },
];

function review(overrides: Record<string, unknown>) {
  return {
    cycle: { code: 'H2-2026', name: 'H2 2026 Review', state: 'OPEN', periodStart: '2026-07-01', periodEnd: '2026-12-31' },
    reviewer: { displayName: 'Sari Admin' },
    assignments: [{ id: 'asg-self', stage: 'SELF', state: 'PENDING', dueAt: '2026-11-20T00:00:00.000Z' }],
    responses: [],
    templateVersion: { allowMissing: false, criteria: CRITERIA },
    finalizedAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

export interface PerformanceMockCalls {
  lists: number;
  assessments: Array<{ url: string; body: Record<string, unknown> }>;
  acks: string[];
}

export async function mockPerformanceApi(
  page: Page,
  options: { summary?: unknown; reviews?: unknown[] } = {}
): Promise<PerformanceMockCalls> {
  const calls: PerformanceMockCalls = { lists: 0, assessments: [], acks: [] };
  const reviews = (options.reviews ?? [
    review({ id: 'rev-self', state: 'SELF_ASSESSMENT' }),
    review({ id: 'rev-final', state: 'FINALIZED', finalizedAt: '2026-10-28T04:00:00.000Z' }),
  ]) as Array<Record<string, unknown>>;
  const summary = options.summary === undefined ? PERFORMANCE_SUMMARY : options.summary;

  await page.route('**/api/mobile/v1/talent/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS_HEADERS });

    const respond = (status: number, json: Record<string, unknown>) =>
      route.fulfill({ status, headers: CORS_HEADERS, contentType: 'application/json', body: JSON.stringify(json) });

    const path = new URL(request.url()).pathname.split('/api/mobile/v1')[1] ?? '/';

    if (path === '/talent/performance') {
      return respond(200, { success: true, data: { summary, trend: PERFORMANCE_TREND } });
    }
    if (path === '/talent/reviews' && request.method() === 'GET') {
      calls.lists += 1;
      return respond(200, { success: true, data: { items: reviews } });
    }
    if (path.startsWith('/talent/reviews/')) {
      const [id, action] = path.slice('/talent/reviews/'.length).split('/');
      const target = reviews.find((item) => item.id === id);
      if (!target) return respond(404, { success: false, error: 'not_found' });

      if (action === 'self-assessment' && request.method() === 'POST') {
        const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
        calls.assessments.push({ url: path, body });
        const responses = Array.isArray(body.responses) ? (body.responses as Array<Record<string, unknown>>) : [];
        target.responses = responses.map((item) => ({
          assignmentId: 'asg-self',
          criterionKey: item.criterionKey,
          score: item.notApplicable === true ? null : (item.score ?? null),
          notApplicable: item.notApplicable === true,
          comment: item.comment ?? null,
        }));
        target.state = 'MANAGER_REVIEW';
        return respond(200, { success: true, data: { review: target } });
      }
      if (action === 'acknowledge' && request.method() === 'POST') {
        calls.acks.push(id);
        target.state = 'ACKNOWLEDGED';
        target.acknowledgedAt = '2026-10-30T00:00:00.000Z';
        return respond(200, { success: true, data: { review: target } });
      }
      return respond(200, { success: true, data: { review: target } });
    }

    return respond(404, { success: false, error: 'not_found' });
  });

  return calls;
}
