import { describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { saveMobileSession } from '@/auth/mobile-session';
import { createEssPayrollApi, EssApiError, type InquirySubmission } from '@/integration/ess/payroll';

const SUMMARY_PUBLISHED = {
  published: true,
  latest: {
    periodId: 'per-9',
    periodCode: '2026-09',
    periodLabel: 'September 2026',
    netSalary: '10250000.00',
    paymentStatus: 'PAID',
    paymentDate: '2026-09-27',
    payslipNumber: 'PAYSLIP-2026-000123',
    hasPayslip: true,
  },
  ytd: { gross: '102500000.00', deductions: '12500000.00' },
  releasedDocumentCount: 1,
  openInquiryCount: 0,
};

const PAYSLIP = {
  payslipId: 'ps-1',
  number: 'PAYSLIP-2026-000123',
  version: 1,
  supersedesNumber: null,
  publishedAt: '2026-09-25T00:00:00.000Z',
  employee: { employeeNumber: 'EMP-007', name: 'Budi Santoso', company: 'WEHA Retail', department: 'Operations', position: 'Store Supervisor' },
  period: { periodId: 'per-9', periodLabel: 'September 2026', paymentDate: '2026-09-27' },
  payment: { status: 'PAID', paidAt: '2026-09-27', reference: 'TRF-8871' },
  earnings: [{ code: 'BASIC', name: 'Basic salary', category: 'FIXED_EARNING', amount: '10000000.00' }],
  deductions: [{ code: 'PPh21', name: 'PPh 21', category: 'STATUTORY', amount: '450000.00' }],
  employeeContributions: [{ code: 'BPJS_KES_EMP', name: 'BPJS Kesehatan (employee)', category: 'STATUTORY', amount: '100000.00' }],
  employerContributions: [{ code: 'BPJS_KERJA_ER', name: 'BPJS Ketenagakerjaan (employer)', category: 'STATUTORY', amount: '176000.00' }],
  summary: { gross: '10700000.00', totalDeductions: '550000.00', netSalary: '10250000.00', employerCost: '10876000.00' },
  pdf: { available: true, generating: false },
};

const INQUIRY = {
  inquiryId: 'inq-1',
  number: 'PAYINQ-2026-000042',
  category: 'INCORRECT_DEDUCTION',
  periodId: 'per-9',
  periodLabel: 'September 2026',
  subject: 'Deduction looks wrong',
  status: 'SUBMITTED',
  submittedAt: '2026-10-22T08:00:00.000Z',
  resolvedAt: null,
  attachmentCount: 1,
  attachments: [{ id: 'att-1', fileName: 'bukti.pdf', mimeType: 'application/pdf', size: 1234 }],
  messages: [{ authorRole: 'EMPLOYEE', authorName: 'Budi Santoso', message: 'Please check', createdAt: '2026-10-22T08:00:00.000Z' }],
};

const SUBMISSION: InquirySubmission = {
  idempotencyKey: 'aaaaaaaaaaaaaaa1',
  category: 'INCORRECT_DEDUCTION',
  periodId: 'per-9',
  subject: 'Deduction looks wrong',
  description: 'PPh 21 doubled this month',
};

async function makeApi(
  cloudImpl: (req: {
    url: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    formData?: Array<{ name: string; value?: string; filename?: string }>;
  }) => unknown
) {
  const { bridge } = await createFakeBridge();
  await saveMobileSession(bridge, {
    email: 'budi@example.com',
    tenant_slug: 'acme',
    access_token: 'test-access-token',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    identity_json: JSON.stringify({ userId: 'u1', employeeId: 'E1' }),
  });
  const request = vi.fn(cloudImpl);
  bridge.cloud.request = request as unknown as typeof bridge.cloud.request;
  const api = await createEssPayrollApi(bridge);
  return { api, request };
}

type CloudReq = Parameters<NonNullable<Parameters<typeof makeApi>[0]>>[0];

const ok = (data: unknown) => () => ({ ok: true, status: 200, headers: {}, json: { success: true, data } });
const fail =
  (status: number, error: string, message?: string) =>
  () => ({ ok: false, status, headers: {}, json: { success: false, error, message } });

describe('EssPayrollApi', () => {
  it('getSummary GETs with the Bearer token and keeps amounts as strings', async () => {
    const { api, request } = await makeApi(ok(SUMMARY_PUBLISHED));

    const summary = await api.getSummary();

    expect(summary.published).toBe(true);
    expect(summary.latest?.netSalary).toBe('10250000.00'); // Decimal string, not a number
    expect(typeof summary.latest?.netSalary).toBe('string');
    const call = request.mock.calls[0][0] as { url: string; headers: Record<string, string> };
    expect(call.url).toContain('/api/mobile/v1/ess/payroll/summary');
    expect(call.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('unpublished summaries parse with no amounts present', async () => {
    const { api } = await makeApi(
      ok({ published: false, releasedDocumentCount: 0, openInquiryCount: 0 })
    );

    const summary = await api.getSummary();

    expect(summary.published).toBe(false);
    expect(summary.latest).toBeFalsy();
    expect(summary.ytd).toBeFalsy();
  });

  it('passes the year filter as a query param on periods/documents/inquiries', async () => {
    const { api, request } = await makeApi(
      ok({ periods: [], documents: [], inquiries: [], payments: [] })
    );

    await api.getPeriods(2026);
    await api.getDocuments(2026);
    await api.listInquiries(2026);
    await api.getPayments();

    const urls = request.mock.calls.map((c) => (c[0] as CloudReq).url);
    expect(urls[0]).toContain('/ess/payroll/periods?year=2026');
    expect(urls[1]).toContain('/ess/payroll/documents?year=2026');
    expect(urls[2]).toContain('/ess/payroll/inquiries?year=2026');
    expect(urls[3]).toContain('/ess/payroll/payments');
  });

  it('getPayslip keeps the employee/employer contribution groups separate and strips unknown fields', async () => {
    const { api } = await makeApi(ok({ payslip: { ...PAYSLIP, salary: '99999999', grossNumber: 10700000 } }));

    const payslip = await api.getPayslip('per-9');

    expect(payslip.employerContributions[0].code).toBe('BPJS_KERJA_ER');
    expect(payslip.employeeContributions[0].code).toBe('BPJS_KES_EMP');
    expect('salary' in payslip).toBe(false);
    expect('grossNumber' in payslip).toBe(false);
    expect(payslip.summary.netSalary).toBe('10250000.00');
  });

  it('downloads the payslip PDF and tax documents as base64 JSON', async () => {
    const { api, request } = await makeApi(
      ok({ file: { base64: btoa('%PDF-1.4 mock'), fileName: 'PAYSLIP-2026-000123.pdf', mimeType: 'application/pdf' } })
    );

    const pdf = await api.downloadPayslipPdf('per-9');
    const doc = await api.downloadDocument('doc-1');

    expect(pdf.file.fileName).toContain('PAYSLIP');
    expect(doc.file.base64.length).toBeGreaterThan(0);
    const urls = request.mock.calls.map((c) => (c[0] as CloudReq).url);
    expect(urls[0]).toContain('/ess/payroll/periods/per-9/payslip/pdf');
    expect(urls[1]).toContain('/ess/payroll/documents/doc-1/download');
  });

  it('maps document_generating to a typed domain error', async () => {
    const { api } = await makeApi(fail(404, 'document_generating', 'The PDF is still being generated.'));

    const err = await api.downloadPayslipPdf('per-9').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).status).toBe(404);
    expect((err as EssApiError).domainCode).toBe('document_generating');
  });

  it('submitInquiry is ONE multipart call with allowlisted keys + idempotency header', async () => {
    const { api, request } = await makeApi(ok({ inquiry: INQUIRY }));

    const inquiry = await api.submitInquiry(SUBMISSION, [
      { filename: 'bukti.pdf', bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' },
    ]);

    expect(inquiry.number).toBe('PAYINQ-2026-000042');
    const call = request.mock.calls[0][0] as CloudReq & {
      formData: Array<{ name: string; value?: string; filename?: string }>;
    };
    expect(call.url).toContain('/ess/payroll/inquiries');
    expect(call.headers!['Idempotency-Key']).toBe('aaaaaaaaaaaaaaa1');
    expect(call.body).toBeUndefined();
    expect(call.formData).toHaveLength(2);
    const payload = JSON.parse(call.formData[0].value ?? '{}') as Record<string, unknown>;
    expect(payload).toEqual(SUBMISSION);
    for (const forbidden of ['employeeId', 'status', 'netSalary', 'paidAt']) {
      expect(Object.keys(payload)).not.toContain(forbidden);
    }
    expect(call.formData[1].filename).toBe('bukti.pdf');
  });

  it('inquiry detail carries the message thread; reply posts text only', async () => {
    const { api, request } = await makeApi((req) => {
      if (req.url.includes('/messages')) return ok({ inquiry: { ...INQUIRY, status: 'SUBMITTED' } })();
      return ok({ inquiry: INQUIRY })();
    });

    const detail = await api.getInquiry('inq-1');
    expect(detail.messages).toHaveLength(1);
    expect(detail.messages?.[0].authorRole).toBe('EMPLOYEE');

    await api.postInquiryMessage('inq-1', 'Any update?');
    const replyCall = request.mock.calls[1][0] as CloudReq;
    expect(replyCall.url).toContain('/ess/payroll/inquiries/inq-1/messages');
    expect(JSON.parse(replyCall.body ?? '{}')).toEqual({ message: 'Any update?' });
  });

  it('maps closed-inquiry replies to status_conflict', async () => {
    const { api } = await makeApi(fail(409, 'status_conflict', 'This inquiry is closed.'));

    const err = await api.postInquiryMessage('inq-1', 'hello').catch((e: unknown) => e);

    expect((err as EssApiError).domainCode).toBe('status_conflict');
  });

  it('throws session_expired when the access token and refresh both fail', async () => {
    const { api } = await makeApi((req) => {
      if (req.url.includes('/auth/refresh')) return fail(401, 'unauthorized')();
      return fail(401, 'unauthorized')();
    });

    const err = await api.getSummary().catch((e: unknown) => e);
    expect((err as EssApiError).code).toBe('session_expired');
  });

  it('fails loudly on contract drift', async () => {
    const { api } = await makeApi(ok({ payslip: { number: 'x' } })); // missing required fields
    const err = await api.getPayslip('per-9').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EssApiError);
    expect((err as EssApiError).code).toBe('unavailable');
  });
});
