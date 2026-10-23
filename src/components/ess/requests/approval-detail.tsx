'use client';

// Approval detail dialog: record context + decision actions. Reject and
// Return require comments (BRD §5); server domain errors (self-approval,
// status conflicts) surface inline. The server is the only authority on
// scope — this dialog cannot widen it.

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ApprovalDetailState } from '@/hooks/useApprovals';
import type { DecisionAction } from '@/integration/ess/requests';
import { REQUEST_TYPE_LABEL, formatDateTime, formatRequestPeriod, toTimelineViews } from '@/lib/ess/requests/view-model';

export interface ApprovalDetailDialogProps {
  detail: ApprovalDetailState;
  onClose: () => void;
  decide: (requestId: string, action: DecisionAction, notes?: string) => Promise<unknown>;
}

export function ApprovalDetailDialog({ detail, onClose, decide }: ApprovalDetailDialogProps) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<DecisionAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approval = detail.status === 'ready' ? detail.approval : null;
  const request = approval?.request ?? null;
  const timeline = toTimelineViews(request?.timeline);

  function reset() {
    setNotes('');
    setBusy(null);
    setError(null);
  }

  async function act(action: DecisionAction) {
    if (!request) return;
    if ((action === 'REJECTED' || action === 'RETURNED') && !notes.trim()) {
      setError('Add a comment — it is required for this action.');
      return;
    }
    setBusy(action);
    setError(null);
    try {
      await decide(request.id, action, notes.trim() || undefined);
      reset();
      onClose(); // the inbox refreshes (the acted item leaves it)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The decision failed.');
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={detail.status !== 'closed'}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="approval-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {detail.status === 'loading' ? 'Loading…' : `${REQUEST_TYPE_LABEL[request?.type ?? 'LEAVE']} request`}
            {request && <Badge variant="secondary">{request.requestNo}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {approval ? `${approval.employee.name}${approval.employee.department ? ` · ${approval.employee.department}` : ''}` : ''}
          </DialogDescription>
        </DialogHeader>

        {detail.status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}

        {detail.status === 'error' && (
          <p className="text-sm text-destructive" data-testid="approval-detail-error">
            {detail.message}
          </p>
        )}

        {request && approval && (
          <div className="space-y-4">
            <div className="divide-y text-sm">
              <div className="flex justify-between gap-4 py-1.5">
                <span className="text-muted-foreground">Period</span>
                <span className="text-right font-medium" data-testid="approval-period">
                  {formatRequestPeriod(request.type, request.period ?? null)}
                </span>
              </div>
              <div className="flex justify-between gap-4 py-1.5">
                <span className="text-muted-foreground">Submitted</span>
                <span className="text-right font-medium">{formatDateTime(request.submittedAt)}</span>
              </div>
              {request.workingDays != null && (
                <div className="flex justify-between gap-4 py-1.5">
                  <span className="text-muted-foreground">Working days</span>
                  <span className="text-right font-medium">{request.workingDays}</span>
                </div>
              )}
              {request.expectedHours != null && (
                <div className="flex justify-between gap-4 py-1.5">
                  <span className="text-muted-foreground">Planned hours</span>
                  <span className="text-right font-medium">{request.expectedHours} h</span>
                </div>
              )}
              <div className="flex justify-between gap-4 py-1.5">
                <span className="text-muted-foreground">Reason</span>
                <span className="break-all text-right font-medium" data-testid="approval-reason">
                  {request.reason ?? '—'}
                </span>
              </div>
              {approval.previousRequestCount != null && (
                <div className="flex justify-between gap-4 py-1.5">
                  <span className="text-muted-foreground">Previous requests</span>
                  <span className="text-right font-medium">{approval.previousRequestCount}</span>
                </div>
              )}
            </div>

            {timeline.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">History</p>
                <ol className="space-y-2">
                  {timeline.map((item, index) => (
                    <li key={index} className="rounded-md border px-3 py-2 text-xs">
                      <p className="font-medium">
                        {item.stepName} — {item.actionLabel}
                        <span className="ml-2 font-normal text-muted-foreground">{item.actorName}</span>
                      </p>
                      {item.notes && <p className="mt-0.5">“{item.notes}”</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="decision-notes">Decision comment</Label>
              <Textarea
                id="decision-notes"
                data-testid="decision-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Required when rejecting or returning"
              />
              <p className="text-xs text-muted-foreground">Every decision records the actor, timestamp and comment.</p>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert" data-testid="decision-error">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" data-testid="decision-approve" disabled={busy !== null} onClick={() => void act('APPROVED')}>
                {busy === 'APPROVED' ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="decision-return"
                disabled={busy !== null}
                onClick={() => void act('RETURNED')}
              >
                {busy === 'RETURNED' ? 'Returning…' : 'Return for correction'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="decision-reject"
                disabled={busy !== null}
                onClick={() => void act('REJECTED')}
              >
                {busy === 'REJECTED' ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
