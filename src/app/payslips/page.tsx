'use client';

// ESS Payslips (BRD §5): payroll summary, payslip archive + breakdown,
// tax & BPJS documents, and payroll inquiries — one route with tabs.
// All amounts server-authored (POSTED+ only); nothing persisted locally.

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBridge } from '@/platform';
import { usePayroll } from '@/hooks/usePayroll';
import { usePayslip } from '@/hooks/usePayslip';
import { useInquiries } from '@/hooks/useInquiries';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PayrollSummaryCard } from '@/components/ess/payroll/payroll-summary-card';
import { PayslipList } from '@/components/ess/payroll/payslip-list';
import { PayslipDetailDialog } from '@/components/ess/payroll/payslip-detail';
import { TaxDocuments } from '@/components/ess/payroll/tax-documents';
import { InquiryList } from '@/components/ess/payroll/inquiry-list';
import { InquiryForm } from '@/components/ess/payroll/inquiry-form';
import { InquiryDetailDialog } from '@/components/ess/payroll/inquiry-detail';
import { createEssPayrollApi } from '@/integration/ess/payroll';
import { EssApiError } from '@/integration/ess/core';
import { saveBase64File } from '@/lib/ess/payroll/download';

type Tab = 'payslips' | 'tax' | 'inquiries';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'payslips', label: 'Payslips' },
  { id: 'tax', label: 'Tax & BPJS' },
  { id: 'inquiries', label: 'Inquiries' },
];

export default function PayslipsPage() {
  const bridge = useBridge();
  const payroll = usePayroll();
  const payslip = usePayslip();
  const inquiries = useInquiries();
  const [tab, setTab] = useState<Tab>('payslips');
  const [formOpen, setFormOpen] = useState(false);

  async function downloadDocument(documentId: string) {
    try {
      const api = await createEssPayrollApi(bridge);
      const file = await api.downloadDocument(documentId);
      saveBase64File(file.file.base64, file.file.fileName, file.file.mimeType ?? 'application/octet-stream');
      toast.add({ title: 'Document saved', type: 'success' });
    } catch (err) {
      if (err instanceof EssApiError && err.domainCode === 'document_generating') {
        toast.add({ title: 'Document is still being generated', description: 'Try again shortly.', type: 'info' });
        return;
      }
      toast.add({ title: 'Download failed', description: err instanceof Error ? err.message : 'Please retry.', type: 'error' });
    }
  }

  async function submitInquiry(
    submission: Parameters<typeof inquiries.submit>[0],
    files: Parameters<typeof inquiries.submit>[1]
  ) {
    const inquiry = await inquiries.submit(submission, files);
    setFormOpen(false);
    toast.add({ title: 'Inquiry submitted', description: 'HR/payroll will respond here.', type: 'success' });
    return inquiry;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="payslips-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Payslips & Payroll</h2>
        <p className="text-sm text-muted-foreground">
          Published payroll only — every amount is confirmed by the payroll module.
        </p>
      </div>

      {payroll.state.status === 'loading' || payroll.state.status === 'idle' ? (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      ) : payroll.state.status === 'no_session' ? (
        <Card data-testid="payslips-no-session">
          <CardHeader className="pb-2">
            <CardDescription>Payroll</CardDescription>
            <CardTitle className="text-lg">No employee session on this device</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sign in with your WEHA account to view payslips and payroll documents.
          </CardContent>
        </Card>
      ) : payroll.state.status === 'error' ? (
        <Card data-testid="payslips-error">
          <CardHeader className="pb-2">
            <CardDescription>Payroll</CardDescription>
            <CardTitle className="text-lg">Could not load payroll</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{payroll.state.error.message}</span>
            <Button variant="outline" size="sm" onClick={payroll.reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (() => {
        const { summary, periods, documents } = payroll.state;
        return (
          <>
            <PayrollSummaryCard summary={summary} />

            <div className="flex flex-wrap gap-1 rounded-lg border p-1" data-testid="payroll-tabs">
              {TABS.map((entry) => (
                <Button
                  key={entry.id}
                  variant={tab === entry.id ? 'default' : 'ghost'}
                  size="sm"
                  data-testid={`payroll-tab-${entry.id}`}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </Button>
              ))}
            </div>

            {tab === 'payslips' && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Published payslips</h3>
                <PayslipList periods={periods} onSelect={payslip.open} />
              </section>
            )}

            {tab === 'tax' && (
              <section className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">Tax & statutory documents</h3>
                  <TaxDocuments documents={documents} onDownload={(id) => void downloadDocument(id)} />
                </div>
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground" data-testid="bpjs-disclaimer">
                  PPh 21 and BPJS amounts on your payslips are payroll records — deductions shown are not
                  proof of remittance to the tax office or BPJS. Documents appear here once payroll releases them.
                </p>
              </section>
            )}

            {tab === 'inquiries' && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Payroll inquiries</h3>
                  {inquiries.state.status === 'ready' && !formOpen && (
                    <Button size="sm" data-testid="new-inquiry" onClick={() => setFormOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                      New inquiry
                    </Button>
                  )}
                </div>

                {formOpen && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Ask payroll about your salary, deductions or documents</CardDescription>
                      <CardTitle className="text-lg">New payroll inquiry</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <InquiryForm
                        periods={periods}
                        onSubmit={submitInquiry}
                        onCancel={() => setFormOpen(false)}
                      />
                    </CardContent>
                  </Card>
                )}

                {inquiries.state.status === 'loading' || inquiries.state.status === 'idle' ? (
                  <Skeleton className="h-24 w-full" />
                ) : inquiries.state.status === 'error' ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-destructive" data-testid="inquiries-error">
                    {inquiries.state.error.message}
                  </p>
                ) : inquiries.state.status === 'ready' ? (
                  <InquiryList inquiries={inquiries.state.inquiries} onSelect={inquiries.openDetail} />
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Sign in with a WEHA account to file payroll inquiries.
                  </p>
                )}
              </section>
            )}

            <PayslipDetailDialog
              detail={payslip.detail}
              onClose={payslip.close}
              onDownloadPdf={(periodId, fileName) => void payslip.downloadPdf(periodId, fileName)}
            />
            <InquiryDetailDialog detail={inquiries.detail} onClose={inquiries.closeDetail} reply={inquiries.reply} />
          </>
        );
      })()}
    </div>
  );
}
