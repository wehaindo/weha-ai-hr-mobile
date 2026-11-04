import { describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { saveMobileSession } from '@/auth/mobile-session';
import { createEssPerformanceApi, EssApiError } from '@/integration/ess/performance';

const SUMMARY = {
  id: 'sum-1',
  revision: 2,
  publishedAt: '2026-07-15T03:00:00.000Z',
  reviewId: 'rev-1',
  reviewState: 'ACKNOWLEDGED',
  cycle: { name: 'H1 2026', periodStart: '2026-01-01', periodEnd: '2026-06-30' },
  overallScore: 82.4,
  rating: 'A',
  ratingLabel: 'Exceeds expectations',
  strengths: ['Reliable', { label: 'Team player' }],
  improvementAreas: ['Notes'],
  recommendations: [{ id: 'rec-1', title: 'Training', description: 'Q4 cohort' }],
  selfScore: 80,
  managerScore: 84,
  previousScore: null,
  kpiAchievement: 90,
  managerComments: 'Great cycle.',
};

const REVIEW = {
  id: 'rev-2',
  state: 'SELF_ASSESSMENT',
  cycle: { name: 'H2 2026', periodStart: '2026-07-01', periodEnd: '2026-12-31' },
  reviewer: { displayName: 'Sari Admin' },
  assignments: [{ id: 'asg-self', stage: 'SELF', state: 'PENDING', dueAt: '2026-11-20T00:00:00.000Z' }],
  responses: [],
  templateVersion: {
    allowMissing: false,
    criteria: [
      { key: 'attendance', label: 'Attendance', weight: 40, maxScore: 5, mandatory: true, isScored: true },
      { key: 'notes', label: 'Notes', weight: 0, maxScore: 0, mandatory: false, isScored: false },
    ],
  },
  finalizedAt: null,
  acknowledgedAt: null,
};

async function makeApi(cloudImpl: (req: { url: string; method?: string; body?: string; headers?: Record<string, string> }) => unknown) {
  const { bridge } = await createFakeBridge();
  await saveMobileSession(bridge, {
    email: 'budi@example.com',
    tenant_slug: 'acme',
    access_token: 'test-access-token',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    identity_json: JSON.stringify({ userId: 'u1', employeeId: 'E1', email: 'budi@example.com' }),
  });
  const request = vi.fn(cloudImpl);
  bridge.cloud.request = request as unknown as typeof bridge.cloud.request;
  const api = await createEssPerformanceApi(bridge);
  return { api, request };
}

const ok = (data: unknown) => ({ ok: true, status: 200, headers: {}, json: { success: true, data } });
const fail = (status: number, error: string, message?: string) => ({
  ok: false,
  status,
  headers: {},
  json: { success: false, error, message },
});

describe('EssPerformanceApi', () => {
  it('parses the published summary and the released trend', async () => {
    const { api, request } = await makeApi(() =>
      ok({
        summary: SUMMARY,
        trend: [
          { reviewId: 'rev-1', cycleName: 'H1 2026', periodEnd: '2026-06-30', score: 82.4, ratingLabel: 'Exceeds', delta: 3.9, comparable: true },
          { reviewId: 'rev-0', cycleName: 'Annual 2025', periodEnd: '2025-12-31', score: 78.5, delta: null, comparable: false, reason: 'Methodology changed' },
        ],
      })
    );

    const result = await api.getMyPerformance();

    expect(result.summary?.overallScore).toBeCloseTo(82.4);
    expect(result.summary?.ratingLabel).toBe('Exceeds expectations');
    expect(result.summary?.previousScore).toBeNull();
    expect(result.trend).toHaveLength(2);
    expect(result.trend[1].comparable).toBe(false);
    expect(result.trend[1].reason).toBe('Methodology changed');
    const call = request.mock.calls[0][0] as { url: string; headers: Record<string, string> };
    expect(call.url).toContain('/api/mobile/v1/talent/performance');
    expect(call.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('accepts a null summary (result not published yet)', async () => {
    const { api } = await makeApi(() => ok({ summary: null, trend: [] }));
    const result = await api.getMyPerformance();
    expect(result.summary).toBeNull();
    expect(result.trend).toEqual([]);
  });

  it('lists reviews and fetches one by id', async () => {
    const { api, request } = await makeApi((req) =>
      req.url.endsWith('/talent/reviews') ? ok({ items: [REVIEW] }) : ok({ review: { ...REVIEW, state: 'FINALIZED' } })
    );

    const items = await api.listReviews();
    expect(items).toHaveLength(1);
    expect(items[0].templateVersion?.criteria?.[0].maxScore).toBe(5);

    const review = await api.getReview('rev-2');
    expect(review.state).toBe('FINALIZED');
    expect((request.mock.calls[1][0] as { url: string }).url).toContain('/talent/reviews/rev-2');
  });

  it('submits the self-assessment with the allowlisted body only', async () => {
    const { api, request } = await makeApi(() => ok({ review: { ...REVIEW, state: 'MANAGER_REVIEW' } }));

    const review = await api.submitSelfAssessment('rev-2', {
      responses: [
        { criterionKey: 'attendance', score: 4, comment: 'No absence' },
        { criterionKey: 'notes', score: null, comment: 'Details' },
      ],
      comments: 'Good cycle',
    });

    expect(review.state).toBe('MANAGER_REVIEW');
    const call = request.mock.calls[0][0] as { url: string; method?: string; body?: string };
    expect(call.url).toContain('/talent/reviews/rev-2/self-assessment');
    expect(call.method).toBe('POST');
    const body = JSON.parse(call.body ?? '{}') as Record<string, unknown>;
    expect(body.comments).toBe('Good cycle');
    const responses = body.responses as Array<Record<string, unknown>>;
    expect(responses[0]).toMatchObject({ criterionKey: 'attendance', score: 4, comment: 'No absence', notApplicable: false });
    expect(responses[1]).toMatchObject({ criterionKey: 'notes', score: null });
    for (const forbidden of ['employeeId', 'status', 'assignmentId']) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('acknowledges a review and surfaces a 409 as an error', async () => {
    const { api } = await makeApi((req) =>
      req.url.includes('/acknowledge')
        ? ok({ review: { ...REVIEW, state: 'ACKNOWLEDGED', acknowledgedAt: '2026-10-30T00:00:00.000Z' } })
        : fail(409, 'conflict', 'Self assessment is not open (review is MANAGER_REVIEW)')
    );

    const acked = await api.acknowledge('rev-2');
    expect(acked.state).toBe('ACKNOWLEDGED');

    const err = await api
      .submitSelfAssessment('rev-2', { responses: [] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).status).toBe(409);
  });

  it('maps contract drift to a loud unavailable error', async () => {
    const { api } = await makeApi(() => ok({ summary: { nope: true }, trend: [] }));
    const err = await api.getMyPerformance().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('unavailable');
  });
});
