'use client';

// ESS Leave (BRD §4.1): balances, own leave requests, and the request form.
// Balances/working days are server-authoritative; drafts are device-local.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useBridge } from '@/platform';
import { useLeave } from '@/hooks/useLeave';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceCard } from '@/components/ess/requests/balance-card';
import { LeaveForm } from '@/components/ess/requests/leave-form';
import { RequestList } from '@/components/ess/requests/request-list';
import { RequestDetailDialog } from '@/components/ess/requests/request-detail';
import { useRequests } from '@/hooks/useRequests';
import { deleteDraft, listDrafts, type RequestDraft } from '@/lib/ess/requests/drafts';

export default function LeavePage() {
  const bridge = useBridge();
  const { state, reload, preview, submitLeave } = useLeave();
  const requests = useRequests({ type: 'LEAVE' });
  const [formOpen, setFormOpen] = useState(false);
  const [drafts, setDrafts] = useState<RequestDraft[]>([]);

  useEffect(() => {
    void listDrafts(bridge).then((all) => setDrafts(all.filter((d) => d.type === 'LEAVE')));
  }, [bridge, formOpen, reload]);

  const ready = state.status === 'ready';

  async function submit(submission: Parameters<typeof submitLeave>[0], files: Parameters<typeof submitLeave>[1]) {
    await submitLeave(submission, files);
    requests.reload(); // the new request must appear in "My leave requests"
    setFormOpen(false);
    toast.add({
      title: 'Leave request submitted',
      description: 'It is now waiting for approval. You will see status changes in Requests.',
      type: 'success',
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="leave-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave</h2>
          <p className="text-sm text-muted-foreground">Balances and leave requests — every value confirmed by the server.</p>
        </div>
        {ready && !formOpen && (
          <Button size="sm" data-testid="new-leave-request" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New leave request
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
        <Card data-testid="leave-no-session">
          <CardHeader className="pb-2">
            <CardDescription>Leave</CardDescription>
            <CardTitle className="text-lg">No employee session on this device</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sign in with your WEHA account to view balances and request leave.
          </CardContent>
        </Card>
      ) : state.status === 'error' ? (
        <Card data-testid="leave-error">
          <CardHeader className="pb-2">
            <CardDescription>Leave</CardDescription>
            <CardTitle className="text-lg">Could not load leave</CardTitle>
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
          <section>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Balances ({state.types.types.length} types)</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="leave-balances">
              {state.balances.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="leave-balances-empty">
                  No leave balances configured yet.
                </p>
              ) : (
                state.balances.map((balance) => <BalanceCard key={balance.leaveTypeId} balance={balance} />)
              )}
            </div>
          </section>

          {drafts.length > 0 && !formOpen && (
            <Card data-testid="leave-drafts">
              <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span>
                  {drafts.length} saved draft{drafts.length === 1 ? '' : 's'} on this device.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="leave-draft-restore"
                  onClick={() => {
                    setFormOpen(true);
                    toast.add({ title: 'Open the form and re-enter your draft values', type: 'info' });
                  }}
                >
                  Continue draft
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="leave-draft-discard"
                  onClick={() => {
                    void Promise.all(drafts.map((d) => deleteDraft(bridge, d.id))).then(() => setDrafts([]));
                  }}
                >
                  Discard drafts
                </Button>
              </CardContent>
            </Card>
          )}

          {formOpen && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>New leave request</CardDescription>
                <CardTitle className="text-lg">Request leave</CardTitle>
              </CardHeader>
              <CardContent>
                <LeaveForm
                  types={state.types.types}
                  balances={state.balances}
                  preview={preview}
                  onSubmit={submit}
                  onCancel={() => setFormOpen(false)}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Sick leave and other permission types are submitted from{' '}
                  <Link href="/requests" className="underline">
                    Requests
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          )}

          <section>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">My leave requests</h3>
            {requests.state.status === 'ready' ? (
              <RequestList
                requests={requests.state.requests}
                onSelect={requests.openDetail}
                emptyText="No leave requests yet."
              />
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </section>

          <RequestDetailDialog
            detail={requests.detail}
            onClose={requests.closeDetail}
            onCancel={(id, reason) => requests.cancel(id, reason)}
            onResubmit={requests.resubmit}
            download={requests.download}
          />
        </>
      )}
    </div>
  );
}
