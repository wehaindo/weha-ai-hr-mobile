'use client';

// Request detail dialog (BRD §4.5): full record, approval timeline,
// attachments with authorized download, cancel (pending) and resubmit
// (returned) actions.

import { useState } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import type { DetailState } from '@/hooks/useRequests';
import type { AnySubmission, EssAttachmentFile, EssRequestSummary } from '@/integration/ess/requests';
import type { EssFilePart } from '@/integration/ess/core';
import { CANCELLABLE_STATUSES, REQUEST_STATUS_LABEL, REQUEST_STATUS_VARIANT, REQUEST_TYPE_LABEL, formatDateTime, formatRequestPeriod, toTimelineViews } from '@/lib/ess/requests/view-model';
import { AttachmentPicker, toFileParts } from './attachment-picker';

function Row({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all text-right font-medium" data-testid={testid}>
        {value}
      </span>
    </div>
  );
}

/** Rebuild a resubmission payload from the server-known record + edited reason. */
export function buildResubmissionPayload(request: EssRequestSummary, key: string, reason: string): AnySubmission | null {
  const payload = (request.payload ?? {}) as Record<string, string | undefined>;
  const period = request.period ?? {};
  if (request.type === 'LEAVE') {
    return {
      idempotencyKey: key,
      leaveTypeId: payload.leaveTypeId ?? '',
      startDate: period.start ?? '',
      endDate: period.end ?? '',
      halfDay: (period.halfDay as 'NONE' | 'FIRST' | 'SECOND' | null) ?? 'NONE',
      reason,
    };
  }
  if (request.type === 'PERMISSION') {
    return {
      idempotencyKey: key,
      permissionCode: payload.permissionCode ?? '',
      date: period.date ?? '',
      startTime: period.startTime ?? undefined,
      endTime: period.endTime ?? undefined,
      reason,
    };
  }
  if (request.type === 'OVERTIME') {
    return {
      idempotencyKey: key,
      date: period.date ?? '',
      startTime: period.startTime ?? '',
      endTime: period.endTime ?? '',
      reason,
      workDescription: payload.workDescription ?? '',
      locationText: payload.locationText ?? undefined,
    };
  }
  if (request.type === 'ATTENDANCE_CORRECTION') {
    return {
      idempotencyKey: key,
      attendanceDate: period.date ?? '',
      originalTime: payload.originalTime ?? undefined,
      requestedTime: payload.requestedTime ?? '',
      explanation: reason,
    };
  }
  return null; // LEAVE_CANCELLATION is not resubmittable from the client
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

export interface RequestDetailDialogProps {
  detail: DetailState;
  onClose: () => void;
  onCancel: (id: string, reason: string) => Promise<unknown>;
  onResubmit: (id: string, payload: AnySubmission, files: EssFilePart[]) => Promise<unknown>;
  download: (requestId: string, attachmentId: string) => Promise<EssAttachmentFile>;
}

export function RequestDetailDialog({ detail, onClose, onCancel, onResubmit, download }: RequestDetailDialogProps) {
  const [mode, setMode] = useState<'view' | 'cancel' | 'resubmit'>('view');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resubmitKey, setResubmitKey] = useState<string | null>(null);

  const request = detail.status === 'ready' ? detail.request : null;

  function reset() {
    setMode('view');
    setReason('');
    setFiles([]);
    setError(null);
    setBusy(false);
    setResubmitKey(null);
  }

  async function act(kind: 'cancel' | 'resubmit') {
    if (!request) return;
    if (kind === 'cancel' && !reason.trim()) {
      setError('Enter a reason for cancelling.');
      return;
    }
    if (kind === 'resubmit' && !reason.trim()) {
      setError('Enter a corrected reason or explanation.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'cancel') {
        await onCancel(request.id, reason.trim());
        toast.add({ title: 'Cancellation requested', description: request.requestNo, type: 'success' });
      } else {
        const key = resubmitKey ?? request.id; // server dedupes on this
        const payload = buildResubmissionPayload(request, key, reason.trim());
        if (!payload) throw new Error('This request cannot be resubmitted.');
        await onResubmit(request.id, payload, await toFileParts(files));
        toast.add({ title: 'Request resubmitted', description: request.requestNo, type: 'success' });
      }
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(attachmentId: string, fileName: string) {
    if (!request) return;
    try {
      const file = await download(request.id, attachmentId);
      const url = URL.createObjectURL(base64ToBlob(file.base64, file.mimeType ?? 'application/octet-stream'));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName || fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.add({ title: 'Download failed', description: 'You may not be authorized for this file.', type: 'error' });
    }
  }

  const timeline = request ? toTimelineViews(request.timeline) : [];
  const canCancel = !!request && CANCELLABLE_STATUSES.includes(request.status);
  const canResubmit = !!request && request.status === 'RETURNED';

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
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="request-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {detail.status === 'loading' ? 'Loading…' : request?.requestNo}
            {request && (
              <Badge variant={REQUEST_STATUS_VARIANT[request.status]} data-testid="detail-status">
                {REQUEST_STATUS_LABEL[request.status]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {request ? `${REQUEST_TYPE_LABEL[request.type]} request · submitted ${formatDateTime(request.submittedAt)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {detail.status === 'loading' && <p className="text-sm text-muted-foreground">Loading the request…</p>}

        {detail.status === 'error' && (
          <p className="text-sm text-destructive" data-testid="detail-error">
            {detail.message}
          </p>
        )}

        {request && (
          <div className="space-y-4">
            <div className="divide-y">
              <Row label="Period" value={formatRequestPeriod(request.type, request.period ?? null)} testid="detail-period" />
              {request.workingDays != null && <Row label="Working days" value={String(request.workingDays)} />}
              {request.expectedHours != null && <Row label="Planned hours" value={`${request.expectedHours} h`} />}
              <Row label="Reason" value={request.reason ?? '—'} testid="detail-reason" />
              {request.currentStepName && <Row label="With" value={request.approverName ?? request.currentStepName} />}
              {request.decidedAt && <Row label="Decided" value={formatDateTime(request.decidedAt)} />}
              {request.returnReason && (
                <Row label="Returned" value={request.returnReason} testid="detail-return-reason" />
              )}
              {request.originalRequestNo && <Row label="Original" value={request.originalRequestNo} />}
            </div>

            {(request.attachments?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Attachments</p>
                <ul className="space-y-1">
                  {request.attachments!.map((attachment) => (
                    <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{attachment.fileName}</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-testid="attachment-download"
                        onClick={() => void downloadFile(attachment.id, attachment.fileName)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        Download
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {timeline.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Approval history</p>
                <ol className="space-y-2" data-testid="detail-timeline">
                  {timeline.map((item, index) => (
                    <li key={index} className="rounded-md border px-3 py-2 text-xs" data-testid="timeline-item">
                      <p className="font-medium">
                        {item.stepName} — {item.actionLabel}
                        <span className="ml-2 font-normal text-muted-foreground">{item.actorName}</span>
                      </p>
                      <p className="text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                      {item.notes && <p className="mt-0.5">“{item.notes}”</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {mode === 'cancel' && (
              <div className="space-y-2 rounded-md border p-3" data-testid="cancel-panel">
                <Label htmlFor="cancel-reason">Why are you cancelling?</Label>
                <Input id="cancel-reason" data-testid="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" data-testid="cancel-confirm" disabled={busy} onClick={() => void act('cancel')}>
                    {busy ? 'Working…' : 'Confirm cancellation'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                    Keep request
                  </Button>
                </div>
              </div>
            )}

            {mode === 'resubmit' && (
              <div className="space-y-3 rounded-md border p-3" data-testid="resubmit-panel">
                <div className="space-y-1.5">
                  <Label htmlFor="resubmit-reason">Corrected reason / explanation</Label>
                  <Input id="resubmit-reason" data-testid="resubmit-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <AttachmentPicker files={files} onChange={setFiles} />
                <div className="flex gap-2">
                  <Button size="sm" data-testid="resubmit-confirm" disabled={busy} onClick={() => void act('resubmit')}>
                    {busy ? 'Submitting…' : 'Resubmit'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" data-testid="detail-action-error">
                {error}
              </p>
            )}

            {mode === 'view' && (canCancel || canResubmit) && (
              <div className="flex flex-wrap gap-2">
                {canResubmit && (
                  <Button
                    size="sm"
                    data-testid="detail-resubmit"
                    onClick={() => {
                      setResubmitKey(`rs_${Date.now().toString(16)}`);
                      setMode('resubmit');
                    }}
                  >
                    Resubmit
                  </Button>
                )}
                {canCancel && (
                  <Button variant="outline" size="sm" data-testid="detail-cancel" onClick={() => setMode('cancel')}>
                    Cancel request
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
