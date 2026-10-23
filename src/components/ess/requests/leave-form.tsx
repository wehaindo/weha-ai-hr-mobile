'use client';

// Leave request form (BRD §4.1): server preview + client mirror validation,
// attachments, local draft save. The submission idempotency key is the draft
// id, so a retried submit can never create a second request.

import { useEffect, useMemo, useState } from 'react';
import { useBridge } from '@/platform';
import { generateId } from '@/lib/id';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EssApiError, type EssFilePart } from '@/integration/ess/core';
import type { EssLeavePreview, EssLeaveType, EssLeaveBalance, HalfDay, LeaveSubmission } from '@/integration/ess/requests';
import { saveDraft } from '@/lib/ess/requests/drafts';
import { estimateWorkingDays } from '@/lib/ess/requests/working-days';
import { hasErrors, validateLeaveForm, type FieldErrors } from '@/lib/ess/requests/validation';
import { AttachmentPicker, toFileParts } from './attachment-picker';

const SERVER_ERROR_COPY: Record<string, string> = {
  overlap: 'Those dates overlap an existing leave request.',
  insufficient_balance: 'Not enough leave balance for those days.',
  attachment_required: 'This leave type requires a supporting document.',
  attachment_too_large: 'That file is larger than 5 MB.',
  unsupported_type: 'Attachments must be images or PDFs.',
};

export interface LeaveFormProps {
  types: EssLeaveType[];
  balances: EssLeaveBalance[];
  preview: (input: { leaveTypeId: string; startDate: string; endDate: string; halfDay?: HalfDay }) => Promise<EssLeavePreview>;
  onSubmit: (submission: LeaveSubmission, files: EssFilePart[]) => Promise<unknown>;
  onCancel: () => void;
}

export function LeaveForm({ types, balances, preview, onSubmit, onCancel }: LeaveFormProps) {
  const bridge = useBridge();
  const [draftId] = useState(() => generateId()); // stable per mount — also the idempotency key
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [halfDay, setHalfDay] = useState<HalfDay>('NONE');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverPreview, setServerPreview] = useState<EssLeavePreview | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedType = types.find((t) => t.id === leaveTypeId);
  const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId);
  const estimatedDays = useMemo(
    () => (halfDay !== 'NONE' && startDate && startDate === endDate ? 0.5 : estimateWorkingDays(startDate, endDate)),
    [startDate, endDate, halfDay]
  );

  // Server preview (working days + overlap + availability) — debounced.
  useEffect(() => {
    if (!leaveTypeId || !startDate || !endDate || endDate < startDate) {
      setServerPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void preview({ leaveTypeId, startDate, endDate, halfDay: halfDay !== 'NONE' ? halfDay : undefined })
        .then((result) => {
          if (!cancelled) setServerPreview(result);
        })
        .catch(() => {
          if (!cancelled) setServerPreview(null); // preview is advisory only
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [halfDay, endDate, leaveTypeId, preview, startDate]);

  async function saveDraftNow() {
    await saveDraft(bridge, {
      id: draftId,
      type: 'LEAVE',
      form: { leaveTypeId, startDate, endDate, halfDay, reason },
      attachmentNames: files.map((f) => f.name),
      savedAt: new Date().toISOString(),
    });
    toast.add({ title: 'Draft saved on this device', type: 'info' });
  }

  async function submit() {
    setServerError(null);
    const nextErrors = validateLeaveForm({ leaveTypeId, startDate, endDate, halfDay, reason, files }, types);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setBusy(true);
    try {
      const submission: LeaveSubmission = {
        idempotencyKey: draftId,
        leaveTypeId,
        startDate,
        endDate,
        halfDay,
        reason: reason.trim(),
      };
      await onSubmit(submission, await toFileParts(files));
    } catch (err) {
      if (err instanceof EssApiError && err.domainCode && SERVER_ERROR_COPY[err.domainCode]) {
        setServerError(SERVER_ERROR_COPY[err.domainCode]);
      } else if (err instanceof EssApiError && err.code === 'validation') {
        setServerError(err.message);
      } else {
        setServerError(err instanceof Error ? err.message : 'Could not submit the request.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="leave-form">
      <div className="space-y-1.5">
        <Label htmlFor="leave-type">Leave type</Label>
        <select
          id="leave-type"
          data-testid="leave-type"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={leaveTypeId}
          onChange={(e) => {
            setLeaveTypeId(e.target.value);
            setErrors({});
          }}
        >
          <option value="">Choose a type…</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        {errors.leaveTypeId && <p className="text-xs text-destructive">{errors.leaveTypeId}</p>}
        {selectedType?.requiresAttachment && (
          <p className="text-xs text-muted-foreground">This type requires a supporting document.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="leave-start">Start date</Label>
          <Input id="leave-start" type="date" data-testid="leave-start" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leave-end">End date</Label>
          <Input id="leave-end" type="date" data-testid="leave-end" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
        </div>
      </div>

      {selectedType?.halfDayAllowed && startDate && startDate === endDate && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="leave-halfday"
            checked={halfDay !== 'NONE'}
            onChange={(e) => setHalfDay(e.target.checked ? 'FIRST' : 'NONE')}
          />
          Half day
          {errors.halfDay && <span className="text-xs text-destructive">{errors.halfDay}</span>}
        </label>
      )}
      {!selectedType?.halfDayAllowed && errors.halfDay && <p className="text-xs text-destructive">{errors.halfDay}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="leave-reason">Reason</Label>
        <Input id="leave-reason" data-testid="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
      </div>

      <AttachmentPicker files={files} onChange={setFiles} error={errors.files} />

      {(estimatedDays > 0 || serverPreview) && (
        <div className="rounded-md border p-3 text-xs text-muted-foreground" data-testid="leave-preview">
          <p>
            ≈ {estimatedDays} working day{estimatedDays === 1 ? '' : 's'} (estimate)
            {serverPreview && serverPreview.workingDays !== estimatedDays && <> · server: {serverPreview.workingDays}</>}
          </p>
          {serverPreview?.overlap && <p className="text-destructive">Those dates overlap an existing request.</p>}
          {serverPreview?.available != null && estimatedDays > serverPreview.available && (
            <p className="text-destructive">Only {serverPreview.available} available for {selectedType?.name ?? 'this type'}.</p>
          )}
          {selectedBalance && (
            <p>
              Balance: {selectedBalance.available} of {selectedBalance.entitled} {selectedBalance.unit === 'HOURS' ? 'hours' : 'days'} available
            </p>
          )}
        </div>
      )}

      {serverError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="leave-server-error">
          {serverError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="leave-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Submitting…' : 'Submit request'}
        </Button>
        <Button variant="outline" size="sm" data-testid="leave-save-draft" disabled={busy} onClick={() => void saveDraftNow()}>
          Save draft
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
