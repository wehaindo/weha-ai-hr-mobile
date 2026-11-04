// ESS talent/performance client — `/api/mobile/v1/talent/*` via the shared core
// (docs/ESS-PERFORMANCE-CONTRACT.md; backend = weha-ai-hrd). Self-only data:
// the employee id always comes from the mobile token, never the request, and
// the server redacts other reviewers' confidential material. Acknowledgement
// is the publish gate: the summary only appears once a FINALIZED review is
// acknowledged.

import { z } from 'zod';
import type { DeviceBridge } from '@/platform';
import { createMobileAuthClient } from '@/integration/mobile-auth/client';
import { createEssCore, EssApiError } from './core';

export { EssApiError } from './core';

export const REVIEW_STATES = [
  'DRAFT',
  'SELF_ASSESSMENT',
  'MANAGER_REVIEW',
  'SECONDARY_REVIEW',
  'CALIBRATION',
  'FINALIZED',
  'ACKNOWLEDGED',
  'CLOSED',
  'CANCELLED',
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

const numberish = z.coerce.number().nullable().optional();

/** One template question (frozen into the review snapshot). */
export const reviewCriterionSchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.coerce.number().optional(),
  maxScore: z.coerce.number(),
  requiresEvidence: z.boolean().optional(),
  section: z.string().optional(),
  type: z.string().nullable().optional(),
  isScored: z.boolean().nullable().optional(),
  group: z.string().nullable().optional(),
  mandatory: z.boolean().nullable().optional(),
  scoreLabels: z.array(z.object({ score: z.coerce.number(), label: z.string() })).optional(),
});
export type ReviewCriterion = z.infer<typeof reviewCriterionSchema>;

export const reviewSchema = z.object({
  id: z.string(),
  state: z.enum(REVIEW_STATES),
  cycle: z
    .object({
      code: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      periodStart: z.string().nullable().optional(),
      periodEnd: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  reviewer: z
    .object({
      displayName: z.string().nullable().optional(),
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  secondaryReviewer: z
    .object({
      displayName: z.string().nullable().optional(),
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  assignments: z
    .array(
      z.object({
        id: z.string().optional(),
        stage: z.string(),
        state: z.string(),
        dueAt: z.string().nullable().optional(),
      })
    )
    .optional(),
  responses: z
    .array(
      z.object({
        id: z.string().optional(),
        assignmentId: z.string().nullable().optional(),
        criterionKey: z.string().nullable().optional(),
        score: numberish,
        maxScore: numberish,
        comment: z.string().nullable().optional(),
        notApplicable: z.boolean().nullable().optional(),
      })
    )
    .optional(),
  templateVersion: z
    .object({
      criteria: z.array(reviewCriterionSchema).optional(),
      sections: z
        .array(z.object({ key: z.string(), label: z.string().optional(), weight: z.coerce.number().optional() }))
        .optional(),
      allowMissing: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  finalizedAt: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  version: z.coerce.number().optional(),
});
export type PerformanceReview = z.infer<typeof reviewSchema>;

export const performanceTrendItemSchema = z.object({
  reviewId: z.string(),
  cycleName: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  score: numberish,
  ratingLabel: z.string().nullable().optional(),
  delta: numberish,
  comparable: z.boolean().optional(),
  reason: z.string().optional(),
});
export type PerformanceTrendItem = z.infer<typeof performanceTrendItemSchema>;

export const performanceSummarySchema = z.object({
  id: z.string(),
  revision: z.coerce.number().optional(),
  publishedAt: z.string().nullable().optional(),
  reviewId: z.string(),
  reviewState: z.string().nullable().optional(),
  cycle: z
    .object({
      name: z.string().nullable().optional(),
      periodStart: z.string().nullable().optional(),
      periodEnd: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  overallScore: z.coerce.number(),
  rating: z.string().nullable().optional(),
  ratingLabel: z.string().nullable().optional(),
  competencyResults: z.array(z.unknown()).optional(),
  strengths: z.array(z.unknown()).optional(),
  improvementAreas: z.array(z.unknown()).optional(),
  recommendations: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable().optional(),
        kind: z.string().nullable().optional(),
        priority: z.string().nullable().optional(),
      })
    )
    .optional(),
  selfScore: numberish,
  managerScore: numberish,
  previousScore: numberish,
  kpiAchievement: numberish,
  employeeComments: z.string().nullable().optional(),
  managerComments: z.string().nullable().optional(),
  hrComments: z.string().nullable().optional(),
});
export type PerformanceSummary = z.infer<typeof performanceSummarySchema>;

export const myPerformanceSchema = z.object({
  summary: performanceSummarySchema.nullable(),
  trend: z.array(performanceTrendItemSchema),
});
export type MyPerformance = z.infer<typeof myPerformanceSchema>;

export const reviewsResponseSchema = z.object({ items: z.array(reviewSchema) });

export interface SelfAssessmentResponseInput {
  criterionKey: string;
  score?: number | null;
  notApplicable?: boolean;
  comment?: string | null;
  evidenceKey?: string | null;
}

export interface SelfAssessmentInput {
  responses: SelfAssessmentResponseInput[];
  comments?: string | null;
}

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  }
  return parsed.data;
}

export class EssPerformanceApi {
  private readonly core: ReturnType<typeof createEssCore>;

  constructor(core: ReturnType<typeof createEssCore>) {
    this.core = core;
  }

  async getMyPerformance(): Promise<MyPerformance> {
    const data = await this.core.request<unknown>('GET', '/talent/performance');
    return parseOrThrow(myPerformanceSchema, data, 'Performance summary');
  }

  async listReviews(): Promise<PerformanceReview[]> {
    const data = await this.core.request<unknown>('GET', '/talent/reviews');
    return parseOrThrow(reviewsResponseSchema, data, 'Performance reviews').items;
  }

  async getReview(reviewId: string): Promise<PerformanceReview> {
    const data = await this.core.request<{ review?: unknown }>(
      'GET',
      `/talent/reviews/${encodeURIComponent(reviewId)}`
    );
    return parseOrThrow(reviewSchema, data.review, 'Performance review');
  }

  /** Submit the SELF assessment (server validates criteria + ranges; 409 when closed). */
  async submitSelfAssessment(reviewId: string, input: SelfAssessmentInput): Promise<PerformanceReview> {
    const data = await this.core.request<{ review?: unknown }>(
      'POST',
      `/talent/reviews/${encodeURIComponent(reviewId)}/self-assessment`,
      {
        responses: input.responses.map((response) => ({
          criterionKey: response.criterionKey,
          score: response.score ?? null,
          notApplicable: response.notApplicable === true ? true : false,
          comment: response.comment ?? null,
        })),
        comments: input.comments ?? null,
      }
    );
    return parseOrThrow(reviewSchema, data.review, 'Self-assessment result');
  }

  /** Acknowledge a FINALIZED review — publishing its summary for the employee. */
  async acknowledge(reviewId: string): Promise<PerformanceReview> {
    const data = await this.core.request<{ review?: unknown }>(
      'POST',
      `/talent/reviews/${encodeURIComponent(reviewId)}/acknowledge`
    );
    return parseOrThrow(reviewSchema, data.review, 'Acknowledgement result');
  }
}

/** Factory: performance client bound to the device bridge. */
export async function createEssPerformanceApi(bridge: DeviceBridge): Promise<EssPerformanceApi> {
  const mobile = await createMobileAuthClient(bridge);
  return new EssPerformanceApi(createEssCore(bridge, mobile));
}
