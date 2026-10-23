// Payroll view model: employee-facing status labels, inquiry labels and
// payslip section grouping. Statuses come from the server's mapped
// PayrollState projection (contract §1.1) — never derived client-side.

import {
  PAYROLL_INQUIRY_CATEGORIES,
  PAYROLL_INQUIRY_STATUSES,
  PAYROLL_PAYMENT_STATUSES,
  type PayslipDetail,
  type PayslipLineView,
  type PayrollInquiryCategory,
  type PayrollInquiryStatus,
  type PayrollPaymentStatus,
} from '@/integration/ess/payroll';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const PAYMENT_STATUS_LABEL: Record<PayrollPaymentStatus, string> = {
  PUBLISHED: 'Published',
  PAID: 'Paid',
  FINALIZED: 'Finalized',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_STATUS_VARIANT: Record<PayrollPaymentStatus, BadgeVariant> = {
  PUBLISHED: 'secondary',
  PAID: 'default',
  FINALIZED: 'outline',
  CANCELLED: 'destructive',
};

export const INQUIRY_STATUS_LABEL: Record<PayrollInquiryStatus, string> = {
  SUBMITTED: 'Submitted',
  IN_PROGRESS: 'HR reviewing',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const INQUIRY_STATUS_VARIANT: Record<PayrollInquiryStatus, BadgeVariant> = {
  SUBMITTED: 'secondary',
  IN_PROGRESS: 'default',
  RESOLVED: 'outline',
  CLOSED: 'secondary',
};

export const INQUIRY_CATEGORY_LABEL: Record<PayrollInquiryCategory, string> = {
  SALARY_DISCREPANCY: 'Salary amount discrepancy',
  MISSING_ALLOWANCE_OVERTIME: 'Missing allowance or overtime',
  INCORRECT_DEDUCTION: 'Incorrect deduction',
  PPH21_INQUIRY: 'PPh 21 inquiry',
  BPJS_INQUIRY: 'BPJS contribution inquiry',
  LOAN_REIMBURSEMENT: 'Loan or reimbursement discrepancy',
  MISSING_PAYSLIP_TAX_DOC: 'Missing payslip or tax document',
  OTHER: 'Other payroll question',
};

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  PPH21_SUMMARY: 'PPh 21 annual summary',
  PPH21_1721_A1: 'Formulir 1721-A1',
  BPJS_STATEMENT: 'BPJS statement',
  OTHER: 'Payroll document',
};

/** Payslip line sections (BRD §4.2/§4.4). */
export interface PayslipSections {
  earnings: PayslipLineView[];
  deductions: PayslipLineView[];
  employeeContributions: PayslipLineView[];
  employerContributions: PayslipLineView[];
}

export function toPayslipSections(payslip: PayslipDetail): PayslipSections {
  return {
    earnings: payslip.earnings,
    deductions: payslip.deductions,
    employeeContributions: payslip.employeeContributions,
    employerContributions: payslip.employerContributions,
  };
}

/** True when the employee may still add messages to the inquiry (contract §3.5). */
export function canReplyToInquiry(status: PayrollInquiryStatus): boolean {
  return status !== 'CLOSED';
}

/** Completeness guards — a label must exist for every contract value. */
export function hasCompletePayrollLabels(): boolean {
  return (
    PAYROLL_PAYMENT_STATUSES.every((s) => PAYMENT_STATUS_LABEL[s] && PAYMENT_STATUS_VARIANT[s]) &&
    PAYROLL_INQUIRY_STATUSES.every((s) => INQUIRY_STATUS_LABEL[s] && INQUIRY_STATUS_VARIANT[s]) &&
    PAYROLL_INQUIRY_CATEGORIES.every((c) => INQUIRY_CATEGORY_LABEL[c])
  );
}
