'use client';

// Approval detail dialog: record context + decision actions. Reject and
// Return require comments (BRD §5); server domain errors (self-approval,
// status conflicts) surface inline. The server is the only authority on
// scope — this dialog cannot widen it.

import { useState } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ApprovalDetailState } from '@/hooks/useApprovals';
import type { DecisionAction, EssAttachmentFile } from '@/integration/ess/requests';
import {
  REQUEST_TYPE_LABEL,
  formatDateTime,
  formatDay,
  formatRequestPeriod,
  toTimelineViews,
} from '@/lib/ess/requests/view-model';
import { formatFileSize } from '@/components/ess/requests/attachment-picker';
import { saveBase64File } from '@/lib/ess/payroll/download';

export interface ApprovalDetailDialogProps {
  detail: ApprovalDetailState;
  onClose: () => void;
  decide: (
    requestId: string,
    action: DecisionAction,
    options?: { notes?: string; expectedVersion?: number }
  ) => Promise<unknown>;
  /** Authorized attachment download (requester/current approver/HR). */
  download?: (requestId: string, attachmentId: string) => Promise<EssAttachmentFile>;
}

function ContextRow({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium" data-testid={testid}>
        {value}
      </span>
    </div>
  );
}

export function ApprovalDetailDialog({ detail, onClose, decide, download }: ApprovalDetailDialogProps) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<DecisionAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const approval = detail.status === 'ready' ? detail.approval : null;
  const request = approval?.request ?? null;
  const timeline = toTimelineViews(request?.timeline);
  const allowedActions = approval?.availableActions;

  function allows(action: DecisionAction): boolean {
    return !allowedActions || allowedActions.includes(action);
  }

  async function downloadAttachment(attachmentId: string, fileName: string) {
    if (!approval?.recordId || !download) return;
    setDownloadError(null);
    try {
      const file = await download(approval.recordId, attachmentId);
      saveBase64File(file.base64, file.fileName || fileName, file.mimeType ?? 'application/octet-stream');
    } catch {
      setDownloadError('Download failed — you may not be authorized for this file.');
    }
  }

  function reset() {
    setNotes('');
    setBusy(null);
    setError(null);
    setDownloadError(null);
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
      await decide(request.id, action, {
        notes: notes.trim() || undefined,
        expectedVersion: approval?.version, // stale → version_conflict (contract §4.5)
      });
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

            {(request.attachments?.length ?? 0) > 0 && download && approval.recordId && (
              <div>
                <p className="mb-1 text-sm font-medium">Supporting attachments</p>
                <ul className="space-y-1">
                  {request.attachments!.map((attachment) => (
                    <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{attachment.fileName}</span>
                        <span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.size)}</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-testid="approval-attachment-download"
                        onClick={() => void downloadAttachment(attachment.id, attachment.fileName)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        Download
                      </Button>
                    </li>
                  ))}
                </ul>
                {downloadError && (
                  <p className="mt-1 text-xs text-destructive" data-testid="approval-download-error">
                    {downloadError}
                  </p>
                )}
              </div>
            )}

            {approval.leaveContext && (
              <div className="rounded-md border p-3 text-xs" data-testid="leave-context">
                <p className="mb-1 text-sm font-medium">Leave details</p>
                <ContextRow label="Leave type" value={approval.leaveContext.leaveType} testid="leave-context-type" />
                <ContextRow
                  label="Dates"
                  value={`${formatDay(approval.leaveContext.startDate)} – ${formatDay(approval.leaveContext.endDate)} · ${approval.leaveContext.requestedDays} day(s)`}
                  testid="leave-context-dates"
                />
                <ContextRow
                  label="Employee balance"
                  value={`${approval.leaveContext.balance.available} available · ${approval.leaveContext.balance.used} used · ${approval.leaveContext.balance.pending} pending`}
                  testid="leave-context-balance"
                />
                {approval.leaveContext.overlapping.length > 0 && (
                  <div className="mt-1.5 rounded border border-amber-500/50 p-2" data-testid="leave-context-overlap">
                    <p className="font-medium text-amber-600 dark:text-amber-400">Overlapping requests:</p>
                    {approval.leaveContext.overlapping.map((overlap) => (
                      <p key={overlap.requestNo}>
                        {overlap.requestNo} · {formatDay(overlap.start)}–{formatDay(overlap.end)} · {overlap.status}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {approval.correctionContext && (
              <div className="rounded-md border p-3 text-xs" data-testid="correction-context">
                <p className="mb-1 text-sm font-medium">Attendance correction</p>
                <ContextRow label="Work date" value={formatDay(approval.correctionContext.workDate)} testid="correction-workdate" />
                <ContextRow label="Type" value={approval.correctionContext.correctionType} />
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div className="rounded border p-2">
                    <p className="mb-0.5 text-[10px] uppercase text-muted-foreground">Recorded</p>
                    {Object.entries(approval.correctionContext.before ?? {}).map(([key, value]) => (
                      <p key={key}>
                        {key}: <strong>{value === null ? '—' : String(value)}</strong>
                      </p>
                    ))}
                  </div>
                  <div className="rounded border">
                    <p className="mb-0.5 text-[10px] uppercase text-muted-foreground">Requested</p>
                    <div className="p-2">
                      {Object.entries(approval.correctionContext.after ?? {}).map(([key, value]) => (
                        <p key={key}>
                          {key}: <strong>{value === null ? '—' : String(value)}</strong>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
                {approval.correctionContext.originalPunch && (
                  <p className="mt-1.5 text-muted-foreground" data-testid="correction-original-punch">
                    Original punch (read-only evidence): {formatDateTime(approval.correctionContext.originalPunch.punchAt)} ·{' '}
                    {approval.correctionContext.originalPunch.punchType} · {approval.correctionContext.originalPunch.source}
                  </p>
                )}
                {approval.correctionContext.attendance && (
                  <p className="text-muted-foreground">
                    Day status: {approval.correctionContext.attendance.status} · check-in{' '}
                    {approval.correctionContext.attendance.checkIn ?? '—'} · check-out{' '}
                    {approval.correctionContext.attendance.checkOut ?? '—'}
                  </p>
                )}
                {approval.correctionContext.schedule && (
                  <p className="text-muted-foreground">Schedule: {approval.correctionContext.schedule.shiftName}</p>
                )}
                {(approval.correctionContext.flags?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1" data-testid="correction-flags">
                    {approval.correctionContext.flags!.map((flag) => (
                      <Badge key={flag} variant="destructive">
                        {flag.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

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
              {allows('APPROVED') && (
                <Button size="sm" data-testid="decision-approve" disabled={busy !== null} onClick={() => void act('APPROVED')}>
                  {busy === 'APPROVED' ? 'Approving…' : 'Approve'}
                </Button>
              )}
              {allows('RETURNED') && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="decision-return"
                  disabled={busy !== null}
                  onClick={() => void act('RETURNED')}
                >
                  {busy === 'RETURNED' ? 'Returning…' : 'Return for correction'}
                </Button>
              )}
              {allows('REJECTED') && (
                <Button
                  variant="destructive"
                  size="sm"
                  data-testid="decision-reject"
                  disabled={busy !== null}
                  onClick={() => void act('REJECTED')}
                >
                  {busy === 'REJECTED' ? 'Rejecting…' : 'Reject'}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
