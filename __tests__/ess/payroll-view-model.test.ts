import { describe, expect, it } from 'vitest';
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
  canReplyToInquiry,
  hasCompletePayrollLabels,
} from '@/lib/ess/payroll/view-model';
import { PAYROLL_INQUIRY_CATEGORIES, PAYROLL_INQUIRY_STATUSES, PAYROLL_PAYMENT_STATUSES } from '@/integration/ess/payroll';

describe('payroll view model', () => {
  it('has labels/variants for every contract status and category (completeness)', () => {
    expect(hasCompletePayrollLabels()).toBe(true);
    for (const status of PAYROLL_PAYMENT_STATUSES) {
      expect(PAYMENT_STATUS_LABEL[status]).toBeTruthy();
      expect(PAYMENT_STATUS_VARIANT[status]).toBeTruthy();
    }
    for (const category of PAYROLL_INQUIRY_CATEGORIES) {
      expect(INQUIRY_CATEGORY_LABEL[category]).toBeTruthy();
    }
  });

  it('maps the employee-facing statuses the client renders (contract §1.1)', () => {
    expect(PAYMENT_STATUS_LABEL.PUBLISHED).toBe('Published');
    expect(PAYMENT_STATUS_LABEL.PAID).toBe('Paid');
    expect(PAYMENT_STATUS_LABEL.FINALIZED).toBe('Finalized');
    expect(PAYMENT_STATUS_LABEL.CANCELLED).toBe('Cancelled');
  });

  it('inquiry replies are allowed until CLOSED', () => {
    for (const status of PAYROLL_INQUIRY_STATUSES) {
      expect(canReplyToInquiry(status)).toBe(status !== 'CLOSED');
    }
    expect(INQUIRY_STATUS_LABEL.IN_PROGRESS).toBe('HR reviewing');
  });
});
