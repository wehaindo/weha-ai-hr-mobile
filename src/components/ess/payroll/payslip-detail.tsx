'use client';

// Payslip detail (BRD §4.2/§4.3/§4.4): identity, period/payment, earnings,
// deductions, employee vs employer contributions — separated sections, IDR
// formatted, server values only. Download = server PDF artifact; print =
// print-friendly view (scoped @media print).

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Printer } from 'lucide-react';
import type { PayslipDetailState } from '@/hooks/usePayslip';
import type { PayslipLineView } from '@/integration/ess/payroll';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_VARIANT } from '@/lib/ess/payroll/view-model';
import { formatIdr, formatIdrNegative } from '@/lib/ess/payroll/money';

function LineRows({ lines, testid, negative = false }: { lines: PayslipLineView[]; testid: string; negative?: boolean }) {
  return (
    <div data-testid={testid}>
      {lines.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">None</p>
      ) : (
        lines.map((line) => (
          <div key={line.code} className="flex items-center justify-between gap-4 py-1 text-sm" data-testid={`${testid}-row`}>
            <span>
              {line.name}
              <span className="ml-1 text-xs text-muted-foreground">({line.code})</span>
            </span>
            <span className="shrink-0 font-medium" data-testid={`${testid}-amount`}>
              {negative ? formatIdrNegative(line.amount) : formatIdr(line.amount)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function Section({ title, children, testid }: { title: string; children: React.ReactNode; testid: string }) {
  return (
    <div className="border-t pt-2" data-testid={testid}>
      <p className="mb-1 text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

export interface PayslipDetailDialogProps {
  detail: PayslipDetailState;
  onClose: () => void;
  onDownloadPdf: (periodId: string, fileName: string) => void;
}

export function PayslipDetailDialog({ detail, onClose, onDownloadPdf }: PayslipDetailDialogProps) {
  const payslip = detail.status === 'ready' ? detail.payslip : null;

  return (
    <Dialog
      open={detail.status !== 'closed'}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto payslip-print-area" data-testid="payslip-detail">
        <DialogHeader className="payslip-no-print">
          <DialogTitle className="flex items-center gap-2">
            {detail.status === 'loading' ? 'Loading…' : `Payslip ${payslip?.number ?? ''}`}
            {payslip && (
              <Badge variant={PAYMENT_STATUS_VARIANT[payslip.payment.status]} data-testid="payslip-detail-status">
                {PAYMENT_STATUS_LABEL[payslip.payment.status]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {payslip ? `${payslip.period.periodLabel} · published ${new Date(payslip.publishedAt).toLocaleDateString()}` : ''}
          </DialogDescription>
        </DialogHeader>

        {detail.status === 'loading' && <p className="text-sm text-muted-foreground">Loading the payslip…</p>}
        {detail.status === 'error' && (
          <p className="text-sm text-destructive" data-testid="payslip-detail-error">
            {detail.message}
          </p>
        )}

        {payslip && (
          <div className="space-y-3 text-sm">
            {payslip.version > 1 && (
              <p className="rounded-md border border-amber-500/50 p-2 text-xs" data-testid="payslip-revised">
                Revised payslip (v{payslip.version})
                {payslip.supersedesNumber ? ` — supersedes ${payslip.supersedesNumber}` : ''}
              </p>
            )}

            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2" data-testid="payslip-identity">
              <p>
                <span className="text-muted-foreground">Employee:</span> {payslip.employee.name}
                {payslip.employee.employeeNumber ? ` · ${payslip.employee.employeeNumber}` : ''}
              </p>
              <p>
                <span className="text-muted-foreground">Company:</span> {payslip.employee.company ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Department:</span> {payslip.employee.department ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Position:</span> {payslip.employee.position ?? '—'}
              </p>
            </div>

            <Section title="Earnings" testid="section-earnings">
              <LineRows lines={payslip.earnings} testid="earning-line" />
            </Section>

            <Section title="Deductions" testid="section-deductions">
              <LineRows lines={payslip.deductions} testid="deduction-line" negative />
            </Section>

            <Section title="Employee contributions" testid="section-employee-contributions">
              <LineRows lines={payslip.employeeContributions} testid="employee-contribution-line" negative />
              <p className="pt-1 text-xs text-muted-foreground">
                Amounts shown are payroll deductions — not proof of remittance to the institution.
              </p>
            </Section>

            <Section title="Employer contributions" testid="section-employer-contributions">
              <LineRows lines={payslip.employerContributions} testid="employer-contribution-line" />
            </Section>

            <Section title="Summary" testid="section-summary">
              <div className="space-y-1">
                <div className="flex justify-between gap-4 py-0.5">
                  <span className="text-muted-foreground">Gross earnings</span>
                  <span className="font-medium" data-testid="summary-gross">{formatIdr(payslip.summary.gross)}</span>
                </div>
                <div className="flex justify-between gap-4 py-0.5">
                  <span className="text-muted-foreground">Total deductions</span>
                  <span className="font-medium" data-testid="summary-deductions">{formatIdrNegative(payslip.summary.totalDeductions)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t pt-1 py-0.5">
                  <span className="font-semibold">Net salary</span>
                  <span className="text-base font-bold" data-testid="summary-net">{formatIdr(payslip.summary.netSalary)}</span>
                </div>
                <div className="flex justify-between gap-4 py-0.5 text-xs text-muted-foreground">
                  <span>Employer cost (info)</span>
                  <span data-testid="summary-employer-cost">{formatIdr(payslip.summary.employerCost)}</span>
                </div>
              </div>
            </Section>

            <Section title="Payment" testid="section-payment">
              <div className="flex justify-between gap-4 py-0.5">
                <span className="text-muted-foreground">
                  {payslip.payment.paidAt ? `Paid ${payslip.payment.paidAt}` : 'Payment not confirmed yet'}
                </span>
                <span className="font-medium" data-testid="payment-reference">
                  {payslip.payment.reference ?? '—'}
                </span>
              </div>
            </Section>

            <div className="flex flex-wrap gap-2 border-t pt-3 payslip-no-print">
              <Button
                size="sm"
                data-testid="payslip-download-pdf"
                disabled={!payslip.pdf.available}
                onClick={() => onDownloadPdf(payslip.period.periodId, `${payslip.number}.pdf`)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Download PDF
              </Button>
              <Button variant="outline" size="sm" data-testid="payslip-print" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Print
              </Button>
              {!payslip.pdf.available && (
                <span className="self-center text-xs text-muted-foreground" data-testid="payslip-pdf-pending">
                  {payslip.pdf.generating ? 'PDF is being generated…' : 'PDF unavailable for this payslip.'}
                </span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
