'use client';

// Payroll inquiry rows (BRD §4.6): number, category, period, status.

import { ChevronRight, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PayrollInquiry } from '@/integration/ess/payroll';
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUS_VARIANT,
} from '@/lib/ess/payroll/view-model';

export function InquiryList({
  inquiries,
  onSelect,
}: {
  inquiries: PayrollInquiry[];
  onSelect: (inquiryId: string) => void;
}) {
  if (inquiries.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="inquiry-list-empty">
        No payroll inquiries yet.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border" data-testid="inquiry-list">
      {inquiries.map((inquiry) => (
        <li key={inquiry.inquiryId}>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
            data-testid="inquiry-row"
            data-status={inquiry.status}
            onClick={() => onSelect(inquiry.inquiryId)}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="text-sm font-medium" data-testid="inquiry-row-subject">
                  {inquiry.subject}
                </span>
                <span className="text-xs text-muted-foreground">
                  {INQUIRY_CATEGORY_LABEL[inquiry.category]}
                  {inquiry.periodLabel ? ` · ${inquiry.periodLabel}` : ''}
                </span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {inquiry.number} · submitted {new Date(inquiry.submittedAt).toLocaleDateString()}
                {inquiry.attachmentCount > 0 ? ` · ${inquiry.attachmentCount} file(s)` : ''}
              </span>
            </span>
            <Badge variant={INQUIRY_STATUS_VARIANT[inquiry.status]} data-testid="inquiry-status">
              {INQUIRY_STATUS_LABEL[inquiry.status]}
            </Badge>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
