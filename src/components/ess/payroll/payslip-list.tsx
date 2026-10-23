'use client';

// Payroll history rows (BRD §4.5): period, net, payment status/date, payslip.

import { ChevronRight, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PayrollPeriodRow } from '@/integration/ess/payroll';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_VARIANT } from '@/lib/ess/payroll/view-model';
import { formatIdr } from '@/lib/ess/payroll/money';

export function PayslipList({
  periods,
  onSelect,
}: {
  periods: PayrollPeriodRow[];
  onSelect: (periodId: string) => void;
}) {
  if (periods.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="payslip-list-empty">
        No published payslips yet.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border" data-testid="payslip-list">
      {periods.map((period) => (
        <li key={period.periodId}>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
            data-testid="payslip-row"
            data-status={period.paymentStatus}
            onClick={() => onSelect(period.periodId)}
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium" data-testid="payslip-period">
                {period.periodLabel}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {period.paymentDate ? `Paid ${period.paymentDate}` : 'Payment pending'}
                {period.payslipNumber ? ` · ${period.payslipNumber}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold" data-testid="payslip-net">
              {formatIdr(period.netSalary)}
            </span>
            <Badge variant={PAYMENT_STATUS_VARIANT[period.paymentStatus]} data-testid="payslip-status">
              {PAYMENT_STATUS_LABEL[period.paymentStatus]}
            </Badge>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
