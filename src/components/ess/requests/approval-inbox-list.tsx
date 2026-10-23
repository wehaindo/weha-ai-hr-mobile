'use client';

// Approval inbox list (BRD §7 manager inbox): server-scoped pending items,
// oldest waiting first, urgency by age.

import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EssInboxItem } from '@/integration/ess/requests';
import { REQUEST_TYPE_ICON, REQUEST_TYPE_LABEL, formatAgeDays, formatDateTime, formatRequestPeriod } from '@/lib/ess/requests/view-model';

export function ApprovalInboxList({
  inbox,
  onSelect,
}: {
  inbox: EssInboxItem[];
  onSelect: (requestId: string) => void;
}) {
  if (inbox.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="approvals-empty">
        No requests need your approval.
      </p>
    );
  }

  const sorted = [...inbox].sort((a, b) => b.ageDays - a.ageDays); // oldest first

  return (
    <ul className="divide-y rounded-md border" data-testid="approvals-list">
      {sorted.map((item) => {
        const Icon = REQUEST_TYPE_ICON[item.type];
        return (
          <li key={item.requestId}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
              data-testid="approval-row"
              onClick={() => onSelect(item.requestId)}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="text-sm font-medium">{item.employee.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {REQUEST_TYPE_LABEL[item.type]} · {item.requestNo}
                  </span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.employee.department ? `${item.employee.department} · ` : ''}
                  {formatRequestPeriod(item.type, item.period ?? null)} · submitted {formatDateTime(item.submittedAt)}
                  {item.currentStepName ? ` · step: ${item.currentStepName}` : ''}
                </span>
                {item.reason && <span className="block truncate text-xs text-muted-foreground">“{item.reason}”</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {item.overdue && (
                  <Badge variant="destructive" data-testid="approval-overdue">
                    Overdue
                  </Badge>
                )}
                <Badge variant={item.ageDays >= 3 ? 'destructive' : 'secondary'} data-testid="approval-age">
                  {formatAgeDays(item.ageDays)}
                </Badge>
                {item.hasAttachments && <span className="text-[10px] text-muted-foreground">has files</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
