'use client';

// ESS Approvals (BRD §5/§7): the manager inbox. Scope is server-side — the
// approval engine only lists requests where the token employee holds a
// pending approver slot; this screen cannot widen it.

import { useApprovals } from '@/hooks/useApprovals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApprovalInboxList } from '@/components/ess/requests/approval-inbox-list';
import { ApprovalDetailDialog } from '@/components/ess/requests/approval-detail';

export default function ApprovalsPage() {
  const { state, detail, reload, openDetail, closeDetail, decide } = useApprovals();

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="approvals-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Approvals</h2>
          <p className="text-sm text-muted-foreground">Requests waiting for your review — oldest first.</p>
        </div>
        {state.status === 'ready' && (
          <Button variant="outline" size="sm" data-testid="approvals-refresh" onClick={reload}>
            Refresh
          </Button>
        )}
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
          {state.inbox.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="approvals-count">
              {state.inbox.length} pending request{state.inbox.length === 1 ? '' : 's'}
            </p>
          )}
          <ApprovalInboxList inbox={state.inbox} onSelect={openDetail} />
          <ApprovalDetailDialog detail={detail} onClose={closeDetail} decide={decide} />
        </>
      )}
    </div>
  );
}
