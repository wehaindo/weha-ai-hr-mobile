// ESS requests client — `/api/mobile/v1/ess/*` via the shared core
// (docs/ESS-REQUESTS-CONTRACT.md). Leave, permission, overtime and
// attendance-correction submissions are atomic multipart calls (JSON
// `request` + `files[]`) keyed by a client idempotency key; approval
// decisions are server-authoritative — the client never sends an employee
// id, status, requestNo or computed fields.

import { z } from 'zod';
import type { DeviceBridge } from '@/platform';
import { createMobileAuthClient, type MobileAuthClient } from '@/integration/mobile-auth/client';
import { createEssCore, EssApiError, type EssCore, type EssFilePart } from './core';

export { EssApiError } from './core';

export const ESS_REQUEST_TYPES = ['LEAVE', 'PERMISSION', 'OVERTIME', 'ATTENDANCE_CORRECTION', 'LEAVE_CANCELLATION'] as const;
export type EssRequestType = (typeof ESS_REQUEST_TYPES)[number];

export const ESS_REQUEST_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as const;
export type EssRequestStatus = (typeof ESS_REQUEST_STATUSES)[number];

export type DecisionAction = 'APPROVED' | 'REJECTED' | 'RETURNED';
export type HalfDay = 'NONE' | 'FIRST' | 'SECOND';

/** Decimal columns may serialize as strings — coerce everywhere. */
const units = z.coerce.number();
const nullableUnits = z.coerce.number().nullable().optional();

export const leaveTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.enum(['DAYS', 'HOURS']),
  halfDayAllowed: z.boolean(),
  requiresAttachment: z.boolean(),
  consumesBalance: z.boolean(),
  maxConsecutiveDays: z.coerce.number().nullable().optional(),
});
export type EssLeaveType = z.infer<typeof leaveTypeSchema>;

export const permissionTypeSchema = z.object({
  code: z.string(),
  name: z.string(),
  requiresAttachment: z.boolean(),
  consumesBalance: z.boolean(),
  isTimed: z.boolean(),
});
export type EssPermissionType = z.infer<typeof permissionTypeSchema>;

export const leaveTypesResponseSchema = z.object({
  types: z.array(leaveTypeSchema),
  permissionTypes: z.array(permissionTypeSchema),
});
export type EssLeaveTypesResponse = z.infer<typeof leaveTypesResponseSchema>;

export const balanceSchema = z.object({
  leaveTypeId: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.enum(['DAYS', 'HOURS']).optional(),
  period: z.string(),
  entitled: units,
  used: units,
  pending: units,
  available: units,
});
export type EssLeaveBalance = z.infer<typeof balanceSchema>;

export const leavePreviewSchema = z.object({
  workingDays: units,
  overlap: z.boolean(),
  available: nullableUnits,
});
export type EssLeavePreview = z.infer<typeof leavePreviewSchema>;

export const attachmentMetaSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string().nullable().optional(),
  size: z.coerce.number(),
});
export type EssAttachmentMeta = z.infer<typeof attachmentMetaSchema>;

export const timelineItemSchema = z.object({
  stepName: z.string(),
  action: z.string(),
  actorName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type EssTimelineItem = z.infer<typeof timelineItemSchema>;

export const requestPeriodSchema = z
  .object({
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    halfDay: z.string().nullable().optional(),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
  })
  .strip();
export type EssRequestPeriod = z.infer<typeof requestPeriodSchema>;

export const requestSummarySchema = z.object({
  id: z.string(),
  requestNo: z.string(),
  type: z.enum(ESS_REQUEST_TYPES),
  status: z.enum(ESS_REQUEST_STATUSES),
  submittedAt: z.string(),
  decidedAt: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  workingDays: nullableUnits,
  expectedHours: nullableUnits,
  period: requestPeriodSchema.nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  currentStepName: z.string().nullable().optional(),
  approverName: z.string().nullable().optional(),
  returnReason: z.string().nullable().optional(),
  attachmentCount: z.coerce.number(),
  attachments: z.array(attachmentMetaSchema).optional(),
  timeline: z.array(timelineItemSchema).optional(),
  originalRequestNo: z.string().nullable().optional(),
});
export type EssRequestSummary = z.infer<typeof requestSummarySchema>;

export const inboxItemSchema = z.object({
  requestId: z.string(),
  requestNo: z.string(),
  type: z.enum(ESS_REQUEST_TYPES),
  employee: z.object({
    id: z.string(),
    name: z.string(),
    department: z.string().nullable().optional(),
  }),
  submittedAt: z.string(),
  period: requestPeriodSchema.nullable().optional(),
  reason: z.string().nullable().optional(),
  currentStepName: z.string().nullable().optional(),
  ageDays: z.coerce.number(),
  hasAttachments: z.boolean(),
});
export type EssInboxItem = z.infer<typeof inboxItemSchema>;

export const approvalDetailSchema = z.object({
  request: requestSummarySchema,
  employee: z.object({
    id: z.string(),
    name: z.string(),
    department: z.string().nullable().optional(),
  }),
  previousRequestCount: z.coerce.number().optional(),
});
export type EssApprovalDetail = z.infer<typeof approvalDetailSchema>;

export const decisionResultSchema = z.object({
  requestId: z.string(),
  action: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  recordStatus: z.enum(ESS_REQUEST_STATUSES),
  nextStepName: z.string().nullable().optional(),
});
export type EssDecisionResult = z.infer<typeof decisionResultSchema>;

/** Client-side submission payloads — server ignores/rejects anything else. */
export interface LeaveSubmission {
  idempotencyKey: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay?: HalfDay;
  reason: string;
}

export interface PermissionSubmission {
  idempotencyKey: string;
  permissionCode: string;
  date: string;
  startTime?: string;
  endTime?: string;
  reason: string;
}

export interface OvertimeSubmission {
  idempotencyKey: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  workDescription: string;
  locationText?: string;
  projectId?: string;
}

export interface CorrectionSubmission {
  idempotencyKey: string;
  attendanceDate: string;
  originalTime?: string;
  requestedTime: string;
  explanation: string;
}

export type AnySubmission = LeaveSubmission | PermissionSubmission | OvertimeSubmission | CorrectionSubmission;

export const attachmentFileSchema = z.object({
  base64: z.string(),
  fileName: z.string(),
  mimeType: z.string().nullable().optional(),
});
export type EssAttachmentFile = z.infer<typeof attachmentFileSchema>;

export interface RequestListQuery {
  status?: EssRequestStatus;
  type?: EssRequestType;
  limit?: number;
}

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Contract drift — fail loudly rather than render wrong request data.
    throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  }
  return parsed.data;
}

function parseListOrThrow<T>(schema: z.ZodType<T[]>, raw: unknown, what: string): T[] {
  const list = schema.safeParse(raw);
  if (!list.success) throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  return list.data;
}

export class EssRequestsApi {
  private readonly core: EssCore;

  constructor(bridge: DeviceBridge, mobile: MobileAuthClient) {
    this.core = createEssCore(bridge, mobile);
  }

  // ── Configuration & balances ────────────────────────────────────────────
  async getLeaveTypes(): Promise<EssLeaveTypesResponse> {
    const data = await this.core.request<unknown>('GET', '/ess/leave/types');
    return parseOrThrow(leaveTypesResponseSchema, data, 'Leave types');
  }

  async getBalances(): Promise<EssLeaveBalance[]> {
    const data = await this.core.request<{ balances: unknown }>('GET', '/ess/leave/balances');
    return parseListOrThrow(z.array(balanceSchema), data.balances, 'Leave balances');
  }

  async previewLeave(input: { leaveTypeId: string; startDate: string; endDate: string; halfDay?: HalfDay }): Promise<EssLeavePreview> {
    const data = await this.core.request<unknown>('POST', '/ess/leave/requests/preview', input);
    return parseOrThrow(leavePreviewSchema, data, 'Leave preview');
  }

  // ── Submissions (atomic multipart — contract §4.1) ──────────────────────
  async submitLeave(submission: LeaveSubmission, files: EssFilePart[] = []): Promise<EssRequestSummary> {
    return this.submit('/ess/leave/requests', submission, files);
  }

  async submitPermission(submission: PermissionSubmission, files: EssFilePart[] = []): Promise<EssRequestSummary> {
    return this.submit('/ess/permission/requests', submission, files);
  }

  async submitOvertime(submission: OvertimeSubmission, files: EssFilePart[] = []): Promise<EssRequestSummary> {
    return this.submit('/ess/overtime/requests', submission, files);
  }

  async submitCorrection(submission: CorrectionSubmission, files: EssFilePart[] = []): Promise<EssRequestSummary> {
    return this.submit('/ess/attendance-corrections', submission, files);
  }

  private async submit(path: string, submission: AnySubmission, files: EssFilePart[]): Promise<EssRequestSummary> {
    const data = await this.core.uploadJson<{ request: unknown }>(path, submission, files, {
      idempotencyKey: submission.idempotencyKey,
    });
    return parseOrThrow(requestSummarySchema, data.request, 'Request');
  }

  // ── Own history ─────────────────────────────────────────────────────────
  async listRequests(query: RequestListQuery = {}): Promise<EssRequestSummary[]> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.type) params.set('type', query.type);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    const data = await this.core.request<{ requests: unknown }>('GET', `/ess/requests${qs ? `?${qs}` : ''}`);
    return parseListOrThrow(z.array(requestSummarySchema), data.requests, 'Request history');
  }

  async getRequest(id: string): Promise<EssRequestSummary> {
    const data = await this.core.request<{ request: unknown }>('GET', `/ess/requests/${encodeURIComponent(id)}`);
    return parseOrThrow(requestSummarySchema, data.request, 'Request detail');
  }

  /** Authorized download — the transport is JSON, so files travel base64 (contract §4). */
  async downloadAttachment(requestId: string, attachmentId: string): Promise<EssAttachmentFile> {
    const data = await this.core.request<{ file: unknown }>(
      'GET',
      `/ess/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(attachmentId)}`
    );
    return parseOrThrow(attachmentFileSchema, data.file, 'Attachment');
  }

  async cancelRequest(id: string, reason: string): Promise<EssRequestSummary> {
    const data = await this.core.request<{ request: unknown }>('POST', `/ess/requests/${encodeURIComponent(id)}/cancel`, { reason });
    return parseOrThrow(requestSummarySchema, data.request, 'Request');
  }

  async resubmitRequest(id: string, payload: AnySubmission, files: EssFilePart[] = []): Promise<EssRequestSummary> {
    const data = await this.core.uploadJson<{ request: unknown }>(
      `/ess/requests/${encodeURIComponent(id)}/resubmit`,
      payload,
      files,
      { idempotencyKey: payload.idempotencyKey }
    );
    return parseOrThrow(requestSummarySchema, data.request, 'Request');
  }

  // ── Approvals (manager scope — server-authoritative) ────────────────────
  async getInbox(formType?: EssRequestType): Promise<EssInboxItem[]> {
    const qs = formType ? `?formType=${encodeURIComponent(formType)}` : '';
    const data = await this.core.request<{ requests: unknown }>('GET', `/ess/approvals/inbox${qs}`);
    return parseListOrThrow(z.array(inboxItemSchema), data.requests, 'Approval inbox');
  }

  async getApproval(requestId: string): Promise<EssApprovalDetail> {
    const data = await this.core.request<{ request: unknown; employee: unknown; previousRequestCount?: unknown }>(
      'GET',
      `/ess/approvals/${encodeURIComponent(requestId)}`
    );
    return parseOrThrow(approvalDetailSchema, data, 'Approval detail');
  }

  async decide(requestId: string, decision: { action: DecisionAction; notes?: string }): Promise<EssDecisionResult> {
    const data = await this.core.request<unknown>('POST', `/ess/approvals/${encodeURIComponent(requestId)}/decision`, decision);
    return parseOrThrow(decisionResultSchema, data, 'Decision result');
  }
}

/** Factory: ESS requests client bound to the device bridge. */
export async function createEssRequestsApi(bridge: DeviceBridge): Promise<EssRequestsApi> {
  const mobile = await createMobileAuthClient(bridge);
  return new EssRequestsApi(bridge, mobile);
}
