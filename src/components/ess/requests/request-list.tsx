'use client';

// Consolidated request rows (BRD §4.5): number, type, period, status,
// approver/decision hints. Selection opens the detail dialog.

import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EssRequestSummary } from '@/integration/ess/requests';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_ICON,
  REQUEST_TYPE_LABEL,
  formatDay,
  formatRequestPeriod,
} from '@/lib/ess/requests/view-model';

export function RequestList({
  requests,
  onSelect,
  emptyText = 'No requests yet.',
}: {
  requests: EssRequestSummary[];
  onSelect: (id: string) => void;
  emptyText?: string;
}) {
  if (requests.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="request-list-empty">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border" data-testid="request-list">
      {requests.map((request) => {
        const Icon = REQUEST_TYPE_ICON[request.type];
        return (
          <li key={request.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
              data-testid="request-row"
              data-status={request.status}
              onClick={() => onSelect(request.id)}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="text-sm font-medium" data-testid="request-no">
                    {request.requestNo}
                  </span>
                  <span className="text-xs text-muted-foreground">{REQUEST_TYPE_LABEL[request.type]}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground" data-testid="request-period">
                  {formatRequestPeriod(request.type, request.period ?? null)}
                  {request.approverName ? ` · with ${request.approverName}` : ''}
                  {request.status === 'SUBMITTED' || request.status === 'IN_REVIEW'
                    ? ` · submitted ${formatDay(request.submittedAt)}`
                    : ''}
                </span>
                {request.returnReason && (
                  <span className="block truncate text-xs text-destructive" data-testid="request-return-reason">
                    Returned: {request.returnReason}
                  </span>
                )}
              </span>
              <Badge variant={REQUEST_STATUS_VARIANT[request.status]} data-testid="request-status">
                {REQUEST_STATUS_LABEL[request.status]}
              </Badge>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
