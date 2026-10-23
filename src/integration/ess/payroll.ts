// ESS payroll client — `/api/mobile/v1/ess/payroll/*` via the shared core
// (docs/ESS-PAYROLL-CONTRACT.md; backend = weha-ai-hrd). Read-only payroll
// data plus inquiry creation: the client never receives unpublished amounts
// (the server gates on POSTED+) and never sends amounts or statuses.
// Money crosses the wire as Decimal STRINGS — formatted for display only,
// never arithmetically combined on the client (BRD §7).

import { z } from 'zod';
import type { DeviceBridge } from '@/platform';
import { createMobileAuthClient, type MobileAuthClient } from '@/integration/mobile-auth/client';
import { createEssCore, EssApiError, type EssCore, type EssFilePart } from './core';

export { EssApiError } from './core';

/** Employee-facing statuses (contract §1.1 — derived server-side). */
export const PAYROLL_PAYMENT_STATUSES = ['PUBLISHED', 'PAID', 'FINALIZED', 'CANCELLED'] as const;
export type PayrollPaymentStatus = (typeof PAYROLL_PAYMENT_STATUSES)[number];

export const PAYROLL_INQUIRY_CATEGORIES = [
  'SALARY_DISCREPANCY',
  'MISSING_ALLOWANCE_OVERTIME',
  'INCORRECT_DEDUCTION',
  'PPH21_INQUIRY',
  'BPJS_INQUIRY',
  'LOAN_REIMBURSEMENT',
  'MISSING_PAYSLIP_TAX_DOC',
  'OTHER',
] as const;
export type PayrollInquiryCategory = (typeof PAYROLL_INQUIRY_CATEGORIES)[number];

export const PAYROLL_INQUIRY_STATUSES = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type PayrollInquiryStatus = (typeof PAYROLL_INQUIRY_STATUSES)[number];

/** Decimal strings from Prisma — kept as strings until formatted. */
const money = z.string();

export const payrollSummarySchema = z.object({
  published: z.boolean(),
  latest: z
    .object({
      periodId: z.string(),
      periodCode: z.string(),
      periodLabel: z.string(),
      netSalary: money,
      paymentStatus: z.enum(PAYROLL_PAYMENT_STATUSES),
      paymentDate: z.string().nullable().optional(),
      payslipNumber: z.string().nullable().optional(),
      hasPayslip: z.boolean(),
    })
    .nullable()
    .optional(),
  ytd: z.object({ gross: money, deductions: money }).nullable().optional(),
  releasedDocumentCount: z.coerce.number(),
  openInquiryCount: z.coerce.number(),
  serverTime: z.string().optional(),
});
export type PayrollSummary = z.infer<typeof payrollSummarySchema>;

export const payrollPeriodSchema = z.object({
  periodId: z.string(),
  periodCode: z.string(),
  periodLabel: z.string(),
  netSalary: money,
  paymentStatus: z.enum(PAYROLL_PAYMENT_STATUSES),
  paymentDate: z.string().nullable().optional(),
  payslipNumber: z.string().nullable().optional(),
  hasPayslip: z.boolean(),
});
export type PayrollPeriodRow = z.infer<typeof payrollPeriodSchema>;

export const payrollPaymentSchema = z.object({
  periodId: z.string(),
  periodLabel: z.string(),
  paidAt: z.string(),
  reference: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
});
export type PayrollPaymentRow = z.infer<typeof payrollPaymentSchema>;

export const payslipLineSchema = z.object({
  code: z.string(),
  name: z.string(),
  category: z.string(),
  amount: money,
});
export type PayslipLineView = z.infer<typeof payslipLineSchema>;

export const payslipSchema = z.object({
  payslipId: z.string(),
  number: z.string(),
  version: z.coerce.number(),
  supersedesNumber: z.string().nullable().optional(),
  publishedAt: z.string(),
  employee: z.object({
    employeeNumber: z.string().nullable().optional(),
    name: z.string(),
    company: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
  }),
  period: z.object({
    periodId: z.string(),
    periodLabel: z.string(),
    paymentDate: z.string().nullable().optional(),
  }),
  payment: z.object({
    status: z.enum(PAYROLL_PAYMENT_STATUSES),
    paidAt: z.string().nullable().optional(),
    reference: z.string().nullable().optional(),
  }),
  earnings: z.array(payslipLineSchema),
  deductions: z.array(payslipLineSchema),
  employeeContributions: z.array(payslipLineSchema),
  employerContributions: z.array(payslipLineSchema),
  summary: z.object({
    gross: money,
    totalDeductions: money,
    netSalary: money,
    employerCost: money,
  }),
  pdf: z.object({ available: z.boolean(), generating: z.boolean() }),
});
export type PayslipDetail = z.infer<typeof payslipSchema>;

export const fileDownloadSchema = z.object({
  file: z.object({
    base64: z.string(),
    fileName: z.string(),
    mimeType: z.string().nullable().optional(),
  }),
});
export type PayrollFileDownload = z.infer<typeof fileDownloadSchema>;

export const payrollDocumentSchema = z.object({
  documentId: z.string(),
  number: z.string().nullable().optional(),
  type: z.string(),
  taxYear: z.coerce.number().nullable().optional(),
  periodLabel: z.string().nullable().optional(),
  status: z.string(),
  releasedAt: z.string().nullable().optional(),
  fileName: z.string(),
  size: z.coerce.number(),
});
export type PayrollDocument = z.infer<typeof payrollDocumentSchema>;

export const inquiryMessageSchema = z.object({
  authorRole: z.enum(['EMPLOYEE', 'HR']),
  authorName: z.string().nullable().optional(),
  message: z.string(),
  createdAt: z.string(),
});
export type InquiryMessage = z.infer<typeof inquiryMessageSchema>;

export const payrollInquirySchema = z.object({
  inquiryId: z.string(),
  number: z.string(),
  category: z.enum(PAYROLL_INQUIRY_CATEGORIES),
  periodId: z.string().nullable().optional(),
  periodLabel: z.string().nullable().optional(),
  subject: z.string(),
  status: z.enum(PAYROLL_INQUIRY_STATUSES),
  submittedAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
  attachmentCount: z.coerce.number(),
  attachments: z
    .array(z.object({ id: z.string(), fileName: z.string(), mimeType: z.string().nullable().optional(), size: z.coerce.number() }))
    .optional(),
  messages: z.array(inquiryMessageSchema).optional(),
});
export type PayrollInquiry = z.infer<typeof payrollInquirySchema>;

/** Client submission — server accepts exactly these keys (contract §3.5). */
export interface InquirySubmission {
  idempotencyKey: string;
  category: PayrollInquiryCategory;
  periodId?: string;
  subject: string;
  description: string;
}

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Contract drift — fail loudly rather than render wrong payroll data.
    throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  }
  return parsed.data;
}

function parseListOrThrow<T>(schema: z.ZodType<T[]>, raw: unknown, what: string): T[] {
  const list = schema.safeParse(raw);
  if (!list.success) throw new EssApiError(`${what} did not match the API contract.`, 500, 'unavailable');
  return list.data;
}

export class EssPayrollApi {
  private readonly core: EssCore;

  constructor(bridge: DeviceBridge, mobile: MobileAuthClient) {
    this.core = createEssCore(bridge, mobile);
  }

  // ── Reads (published payroll only — the server gates) ───────────────────
  async getSummary(): Promise<PayrollSummary> {
    const data = await this.core.request<unknown>('GET', '/ess/payroll/summary');
    return parseOrThrow(payrollSummarySchema, data, 'Payroll summary');
  }

  async getPeriods(year?: number): Promise<PayrollPeriodRow[]> {
    const qs = year ? `?year=${year}` : '';
    const data = await this.core.request<{ periods: unknown }>('GET', `/ess/payroll/periods${qs}`);
    return parseListOrThrow(z.array(payrollPeriodSchema), data.periods, 'Payroll periods');
  }

  async getPayments(): Promise<PayrollPaymentRow[]> {
    const data = await this.core.request<{ payments: unknown }>('GET', '/ess/payroll/payments');
    return parseListOrThrow(z.array(payrollPaymentSchema), data.payments, 'Payroll payments');
  }

  async getPayslip(periodId: string): Promise<PayslipDetail> {
    const data = await this.core.request<{ payslip: unknown }>(
      'GET',
      `/ess/payroll/periods/${encodeURIComponent(periodId)}/payslip`
    );
    return parseOrThrow(payslipSchema, data.payslip, 'Payslip');
  }

  /** Server-generated PDF artifact (contract §3.4). Throws `document_generating`. */
  async downloadPayslipPdf(periodId: string): Promise<PayrollFileDownload> {
    const data = await this.core.request<unknown>(
      'GET',
      `/ess/payroll/periods/${encodeURIComponent(periodId)}/payslip/pdf`
    );
    return parseOrThrow(fileDownloadSchema, data, 'Payslip PDF');
  }

  async getDocuments(year?: number): Promise<PayrollDocument[]> {
    const qs = year ? `?year=${year}` : '';
    const data = await this.core.request<{ documents: unknown }>('GET', `/ess/payroll/documents${qs}`);
    return parseListOrThrow(z.array(payrollDocumentSchema), data.documents, 'Payroll documents');
  }

  async downloadDocument(documentId: string): Promise<PayrollFileDownload> {
    const data = await this.core.request<unknown>(
      'GET',
      `/ess/payroll/documents/${encodeURIComponent(documentId)}/download`
    );
    return parseOrThrow(fileDownloadSchema, data, 'Payroll document');
  }

  // ── Inquiries (BRD §4.6) ────────────────────────────────────────────────
  async submitInquiry(submission: InquirySubmission, files: EssFilePart[] = []): Promise<PayrollInquiry> {
    const data = await this.core.uploadJson<{ inquiry: unknown }>('/ess/payroll/inquiries', submission, files, {
      idempotencyKey: submission.idempotencyKey,
    });
    return parseOrThrow(payrollInquirySchema, data.inquiry, 'Inquiry');
  }

  async listInquiries(year?: number): Promise<PayrollInquiry[]> {
    const qs = year ? `?year=${year}` : '';
    const data = await this.core.request<{ inquiries: unknown }>('GET', `/ess/payroll/inquiries${qs}`);
    return parseListOrThrow(z.array(payrollInquirySchema), data.inquiries, 'Inquiries');
  }

  async getInquiry(inquiryId: string): Promise<PayrollInquiry> {
    const data = await this.core.request<{ inquiry: unknown }>(
      'GET',
      `/ess/payroll/inquiries/${encodeURIComponent(inquiryId)}`
    );
    return parseOrThrow(payrollInquirySchema, data.inquiry, 'Inquiry detail');
  }

  async postInquiryMessage(inquiryId: string, message: string): Promise<PayrollInquiry> {
    const data = await this.core.request<{ inquiry: unknown }>(
      'POST',
      `/ess/payroll/inquiries/${encodeURIComponent(inquiryId)}/messages`,
      { message }
    );
    return parseOrThrow(payrollInquirySchema, data.inquiry, 'Inquiry detail');
  }
}

/** Factory: ESS payroll client bound to the device bridge. */
export async function createEssPayrollApi(bridge: DeviceBridge): Promise<EssPayrollApi> {
  const mobile = await createMobileAuthClient(bridge);
  return new EssPayrollApi(bridge, mobile);
}
