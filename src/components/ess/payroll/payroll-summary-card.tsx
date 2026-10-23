'use client';

// Payroll dashboard summary (BRD §5.1): latest published period, net,
// payment status, YTD — server values only; unpublished → honest empty state.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PayrollSummary } from '@/integration/ess/payroll';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_VARIANT } from '@/lib/ess/payroll/view-model';
import { formatIdr } from '@/lib/ess/payroll/money';

export function PayrollSummaryCard({ summary }: { summary: PayrollSummary }) {
  return (
    <Card data-testid="payroll-summary-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>Latest payroll</CardDescription>
          {summary.published && summary.latest && (
            <Badge
              variant={PAYMENT_STATUS_VARIANT[summary.latest.paymentStatus]}
              data-testid="payroll-payment-status"
            >
              {PAYMENT_STATUS_LABEL[summary.latest.paymentStatus]}
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg">
          {summary.published && summary.latest ? summary.latest.periodLabel : 'No published payroll yet'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {summary.published && summary.latest ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Net salary</span>
              <span className="text-xl font-bold tracking-tight" data-testid="payroll-net">
                {formatIdr(summary.latest.netSalary)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span data-testid="payroll-payment-date">
                {summary.latest.paymentDate ? `Paid ${summary.latest.paymentDate}` : 'Payment not confirmed yet'}
              </span>
              {summary.latest.payslipNumber && <span data-testid="payroll-payslip-number">{summary.latest.payslipNumber}</span>}
            </div>
            {summary.ytd && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground" data-testid="payroll-ytd">
                <span>YTD gross: {formatIdr(summary.ytd.gross)}</span>
                <span>YTD deductions: {formatIdr(summary.ytd.deductions)}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground" data-testid="payroll-unpublished">
            Amounts appear here once payroll is published for your period.
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span data-testid="payroll-doc-count">{summary.releasedDocumentCount} tax document(s)</span>
          <span data-testid="payroll-open-inquiries">{summary.openInquiryCount} open inquiry(ies)</span>
        </div>
        <Link href="/payslips" className="inline-flex items-center gap-1 text-xs font-medium underline" data-testid="payroll-summary-link">
          Payslips & inquiries <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
