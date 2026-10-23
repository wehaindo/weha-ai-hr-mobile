'use client';

// ESS Approvals (FR-602): the manager inbox with server-side filters and
// cursor pagination. Scope stays server-side — the approval engine only
// lists slots held by the token employee (or an active delegate); this
// screen cannot widen it.

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useApprovals } from '@/hooks/useApprovals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApprovalInboxList } from '@/components/ess/requests/approval-inbox-list';
import { ApprovalDetailDialog } from '@/components/ess/requests/approval-detail';
import { DelegationsDialog } from '@/components/ess/requests/delegations-dialog';
import type { ApprovalInboxFilters, EssRequestType } from '@/integration/ess/requests';

const TYPE_OPTIONS: Array<{ label: string; value: '' | EssRequestType }> = [
  { label: 'All types', value: '' },
  { label: 'Leave', value: 'LEAVE' },
  { label: 'Permission', value: 'PERMISSION' },
  { label: 'Overtime', value: 'OVERTIME' },
  { label: 'Attendance correction', value: 'ATTENDANCE_CORRECTION' },
  { label: 'Leave cancellation', value: 'LEAVE_CANCELLATION' },
];

const STATUS_OPTIONS: Array<{ label: string; value: ApprovalInboxFilters['status'] }> = [
  { label: 'Pending', value: undefined },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Returned', value: 'RETURNED' },
];

export default function ApprovalsPage() {
  const { state, detail, filters, setFilters, loadMore, reload, openDetail, closeDetail, decide, download } =
    useApprovals();
  const [delegationsOpen, setDelegationsOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.q ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (searchDraft !== (filters.q ?? '')) setFilters({ ...filters, q: searchDraft || undefined });
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [filters, searchDraft, setFilters]);

  function update(patch: Partial<ApprovalInboxFilters>) {
    setFilters({ ...filters, ...patch });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="approvals-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Approvals</h2>
          <p className="text-sm text-muted-foreground">
            Requests waiting for your review — oldest first, scoped by the backend.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" data-testid="approvals-delegations" onClick={() => setDelegationsOpen(true)}>
            Delegations
          </Button>
          {state.status === 'ready' && (
            <Button variant="outline" size="sm" data-testid="approvals-refresh" onClick={reload}>
              Refresh
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
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
      ) : state.status === 'no_session' ? (
        <Card data-testid="approvals-no-session">
          <CardHeader className="pb-2">
            <CardDescription>Approvals</CardDescription>
            <CardTitle className="text-lg">No employee session on this device</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sign in with your WEHA account to review requests assigned to you.
          </CardContent>
        </Card>
      ) : state.status === 'error' ? (
        <Card data-testid="approvals-error">
          <CardHeader className="pb-2">
            <CardDescription>Approvals</CardDescription>
            <CardTitle className="text-lg">Could not load approvals</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{state.error.message}</span>
            <Button variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" data-testid="approval-filters">
            <select
              aria-label="Filter by type"
              data-testid="filter-form-type"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filters.formType ?? ''}
              onChange={(e) => update({ formType: (e.target.value || undefined) as EssRequestType | undefined })}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              data-testid="filter-status"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filters.status ?? ''}
              onChange={(e) =>
                update({ status: (e.target.value || undefined) as ApprovalInboxFilters['status'] })
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value ?? ''}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                data-testid="filter-overdue"
                checked={!!filters.overdue}
                onChange={(e) => update({ overdue: e.target.checked || undefined })}
              />
              Overdue only
            </label>
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <Input
                aria-label="Search requests"
                placeholder="Employee or request no…"
                data-testid="filter-search"
                className="h-9 w-56 pl-8"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </div>
          </div>

          {state.inbox.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="approvals-count">
              {state.inbox.length} request{state.inbox.length === 1 ? '' : 's'} shown
            </p>
          )}
          <ApprovalInboxList inbox={state.inbox} onSelect={openDetail} />

          {state.nextCursor && (
            <Button variant="outline" size="sm" data-testid="approvals-load-more" onClick={loadMore}>
              Load more
            </Button>
          )}

          <ApprovalDetailDialog detail={detail} onClose={closeDetail} decide={decide} download={download} />
          <DelegationsDialog open={delegationsOpen} onClose={() => setDelegationsOpen(false)} />
        </>
      )}
    </div>
  );
}
