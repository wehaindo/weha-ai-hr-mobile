import type { Page, Route } from '@playwright/test';
import { CORS_HEADERS } from './ess-mock';

// Mocks `/api/mobile/v1/ess/payroll/*` (contract: docs/ESS-PAYROLL-CONTRACT.md)
// with a small stateful model. Register AFTER mockEssApi.

export const PAYSLIP = {
  payslipId: 'ps-1',
  number: 'PAYSLIP-2026-000123',
  version: 1,
  supersedesNumber: null,
  publishedAt: '2026-09-25T00:00:00.000Z',
  employee: { employeeNumber: 'EMP-007', name: 'Budi Santoso', company: 'WEHA Retail', department: 'Operations', position: 'Store Supervisor' },
  period: { periodId: 'per-9', periodLabel: 'September 2026', paymentDate: '2026-09-27' },
  payment: { status: 'PAID', paidAt: '2026-09-27', reference: 'TRF-8871' },
  earnings: [
    { code: 'BASIC', name: 'Basic salary', category: 'FIXED_EARNING', amount: '10000000.00' },
    { code: 'OT', name: 'Overtime', category: 'VARIABLE_EARNING', amount: '350000.00' },
  ],
  deductions: [{ code: 'PPh21', name: 'PPh 21', category: 'STATUTORY', amount: '450000.00' }],
  employeeContributions: [{ code: 'BPJS_KES_EMP', name: 'BPJS Kesehatan (employee)', category: 'STATUTORY', amount: '100000.00' }],
  employerContributions: [{ code: 'BPJS_KERJA_ER', name: 'BPJS Ketenagakerjaan (employer)', category: 'STATUTORY', amount: '176000.00' }],
  summary: { gross: '10700000.00', totalDeductions: '550000.00', netSalary: '10250000.00', employerCost: '10876000.00' },
  pdf: { available: true, generating: false },
  salary: '10000000', // deliberate leak probe — must be stripped by zod
};

export const PERIOD = {
  periodId: 'per-9',
  periodCode: '2026-09',
  periodLabel: 'September 2026',
  netSalary: '10250000.00',
  paymentStatus: 'PAID',
  paymentDate: '2026-09-27',
  payslipNumber: 'PAYSLIP-2026-000123',
  hasPayslip: true,
};

export const SUMMARY = {
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

export const DOCUMENTS = [
  {
    documentId: 'doc-1',
    number: 'PAYDOC-2026-000007',
    type: 'PPH21_1721_A1',
    taxYear: 2025,
    periodLabel: null,
    status: 'RELEASED',
    releasedAt: '2026-03-01',
    fileName: '1721-A1-2025.pdf',
    size: 245000,
  },
];

export const INQUIRY = {
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
  messages: [{ authorRole: 'EMPLOYEE', authorName: 'Budi Santoso', message: 'PPh 21 doubled this month', createdAt: '2026-10-22T08:00:00.000Z' }],
};

export interface PayrollMockCalls {
  summaryAuth: (string | null)[];
  pdfDownloads: number;
  documentDownloads: number;
  inquirySubmits: Array<{ idempotencyKey: string | null; multipart: string; requestJson: Record<string, unknown> | null }>;
  replies: Array<{ url: string; body: Record<string, unknown> }>;
}

export interface PayrollMockOptions {
  published?: boolean;
  pdfGenerating?: boolean;
  inquiries?: unknown[];
  /** Override the next inquiry submit (e.g. force a domain error). */
  submit?: () => { status: number; json: Record<string, unknown> };
}

export async function mockPayrollApi(page: Page, options: PayrollMockOptions = {}): Promise<{ calls: PayrollMockCalls }> {
  const calls: PayrollMockCalls = { summaryAuth: [], pdfDownloads: 0, documentDownloads: 0, inquirySubmits: [], replies: [] };
  const published = options.published ?? true;
  const inquiries = options.inquiries ?? [INQUIRY];

  await page.route('**/api/mobile/v1/ess/payroll/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const respond = (status: number, json: Record<string, unknown>) =>
      route.fulfill({ status, headers: CORS_HEADERS, contentType: 'application/json', body: JSON.stringify(json) });

    const url = request.url();

    if (url.includes('/ess/payroll/summary')) {
      calls.summaryAuth.push(request.headers()['authorization'] ?? null);
      if (!published) {
        return respond(200, { success: true, data: { published: false, releasedDocumentCount: 0, openInquiryCount: 0 } });
      }
      return respond(200, { success: true, data: SUMMARY });
    }
    if (url.includes('/payslip/pdf')) {
      calls.pdfDownloads += 1;
      if (options.pdfGenerating) return respond(404, { success: false, error: 'document_generating', message: 'Still generating.' });
      return respond(200, {
        success: true,
        data: { file: { base64: btoa('%PDF-1.4 mock payslip'), fileName: 'PAYSLIP-2026-000123.pdf', mimeType: 'application/pdf' } },
      });
    }
    if (url.includes('/ess/payroll/periods/') && url.includes('/payslip')) {
      const payslip = options.pdfGenerating ? { ...PAYSLIP, pdf: { available: false, generating: true } } : PAYSLIP;
      return respond(200, { success: true, data: { payslip } });
    }
    if (url.includes('/ess/payroll/periods')) {
      return respond(200, { success: true, data: { periods: published ? [PERIOD] : [] } });
    }
    if (url.includes('/ess/payroll/documents') && url.includes('/download')) {
      calls.documentDownloads += 1;
      return respond(200, {
        success: true,
        data: { file: { base64: btoa('%PDF-1.4 mock tax doc'), fileName: '1721-A1-2025.pdf', mimeType: 'application/pdf' } },
      });
    }
    if (url.includes('/ess/payroll/documents')) {
      return respond(200, { success: true, data: { documents: DOCUMENTS } });
    }
    if (url.includes('/ess/payroll/payments')) {
      return respond(200, {
        success: true,
        data: { payments: [{ periodId: 'per-9', periodLabel: 'September 2026', paidAt: '2026-09-27', reference: 'TRF-8871', method: 'TRANSFER' }] },
      });
    }

    // Inquiries
    if (request.method() === 'POST' && url.includes('/ess/payroll/inquiries/') && url.includes('/messages')) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      calls.replies.push({ url, body });
      return respond(200, {
        success: true,
        data: {
          inquiry: {
            ...INQUIRY,
            status: 'SUBMITTED',
            messages: [...(INQUIRY.messages as unknown[]), { authorRole: 'EMPLOYEE', authorName: 'Budi Santoso', message: body.message, createdAt: '2026-10-22T09:00:00.000Z' }],
          },
        },
      });
    }
    if (request.method() === 'POST' && url.includes('/ess/payroll/inquiries')) {
      const postData = request.postData() ?? '';
      const match = postData.match(/name="request"[\r\n]+[\r\n]+(\{[\s\S]*?\})[\r\n]+--/);
      let requestJson: Record<string, unknown> | null = null;
      try {
        requestJson = match ? (JSON.parse(match[1]) as Record<string, unknown>) : null;
      } catch {
        requestJson = null;
      }
      calls.inquirySubmits.push({
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
        multipart: postData,
        requestJson,
      });
      if (options.submit) {
        const override = options.submit();
        return respond(override.status, override.json);
      }
      return respond(200, {
        success: true,
        data: {
          inquiry: {
            ...INQUIRY,
            inquiryId: 'inq-new',
            number: 'PAYINQ-2026-000099',
            status: 'SUBMITTED',
            messages: [],
          },
        },
      });
    }
    if (url.includes('/ess/payroll/inquiries/')) {
      const inquiryId = url.match(/inquiries\/([^/?]+)$/)?.[1] ?? '';
      const fromList = (inquiries as Array<{ inquiryId: string }>).find((item) => item.inquiryId === inquiryId);
      return respond(200, { success: true, data: { inquiry: fromList ?? INQUIRY } });
    }
    if (url.includes('/ess/payroll/inquiries')) {
      return respond(200, { success: true, data: { inquiries } });
    }

    return route.fallback();
  });

  return { calls };
}
