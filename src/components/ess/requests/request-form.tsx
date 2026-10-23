'use client';

// Type-driven request form for PERMISSION / OVERTIME / ATTENDANCE_CORRECTION
// (leave has its own form on /leave). Same conventions: client mirror
// validation, attachments, local draft, idempotency key = draft id, server
// domain errors surfaced inline.

import { useState } from 'react';
import { useBridge } from '@/platform';
import { generateId } from '@/lib/id';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EssApiError, type EssFilePart } from '@/integration/ess/core';
import type {
  EssPermissionType,
  PermissionSubmission,
  CorrectionSubmission,
  OvertimeSubmission,
} from '@/integration/ess/requests';
import { saveDraft } from '@/lib/ess/requests/drafts';
import {
  hasErrors,
  hoursBetween,
  MAX_OVERTIME_HOURS,
  validateCorrectionForm,
  validateOvertimeForm,
  validatePermissionForm,
  type FieldErrors,
} from '@/lib/ess/requests/validation';
import { AttachmentPicker, toFileParts } from './attachment-picker';

export type RequestFormType = 'PERMISSION' | 'OVERTIME' | 'ATTENDANCE_CORRECTION';

const SERVER_ERROR_COPY: Record<string, string> = {
  overlap: 'Those dates overlap an existing request.',
  schedule_conflict: 'That overtime clashes with your schedule or an existing overtime request.',
  status_conflict: 'The request changed state — refresh and try again.',
  attachment_required: 'This type requires a supporting document.',
  attachment_too_large: 'That file is larger than 5 MB.',
  unsupported_type: 'Attachments must be images or PDFs.',
};

export type RequestFormSubmission = PermissionSubmission | OvertimeSubmission | CorrectionSubmission;

export interface RequestFormProps {
  type: RequestFormType;
  permissionTypes: EssPermissionType[];
  onSubmit: (submission: RequestFormSubmission, files: EssFilePart[]) => Promise<unknown>;
  onCancel: () => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function RequestForm({ type, permissionTypes, onSubmit, onCancel }: RequestFormProps) {
  const bridge = useBridge();
  const [draftId] = useState(() => generateId()); // stable per mount — also the idempotency key

  // Shared fields
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  // Permission
  const [permissionCode, setPermissionCode] = useState('');
  // Overtime
  const [workDescription, setWorkDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  // Correction
  const [attendanceDate, setAttendanceDate] = useState('');
  const [originalTime, setOriginalTime] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [explanation, setExplanation] = useState('');

  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedPermission = permissionTypes.find((t) => t.code === permissionCode);
  const overtimeHours = type === 'OVERTIME' ? hoursBetween(startTime, endTime) : 0;

  function validate(): FieldErrors {
    if (type === 'PERMISSION') {
      return validatePermissionForm({ permissionCode, date, startTime, endTime, reason, files }, permissionTypes);
    }
    if (type === 'OVERTIME') {
      return validateOvertimeForm({ date, startTime, endTime, reason, workDescription, locationText, files });
    }
    return validateCorrectionForm({ attendanceDate, originalTime, requestedTime, explanation, files });
  }

  async function saveDraftNow() {
    await saveDraft(bridge, {
      id: draftId,
      type,
      form: currentForm(),
      attachmentNames: files.map((f) => f.name),
      savedAt: new Date().toISOString(),
    });
    toast.add({ title: 'Draft saved on this device', type: 'info' });
  }

  function currentForm(): Record<string, unknown> {
    if (type === 'PERMISSION') return { permissionCode, date, startTime, endTime, reason };
    if (type === 'OVERTIME') return { date, startTime, endTime, reason, workDescription, locationText };
    return { attendanceDate, originalTime, requestedTime, explanation };
  }

  async function submit() {
    setServerError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setBusy(true);
    try {
      const key = draftId;
      let submission: RequestFormSubmission;
      if (type === 'PERMISSION') {
        submission = {
          idempotencyKey: key,
          permissionCode,
          date,
          startTime: selectedPermission?.isTimed ? startTime : undefined,
          endTime: selectedPermission?.isTimed ? endTime : undefined,
          reason: reason.trim(),
        } satisfies PermissionSubmission;
      } else if (type === 'OVERTIME') {
        submission = {
          idempotencyKey: key,
          date,
          startTime,
          endTime,
          reason: reason.trim(),
          workDescription: workDescription.trim(),
          locationText: locationText.trim() || undefined,
        } satisfies OvertimeSubmission;
      } else {
        submission = {
          idempotencyKey: key,
          attendanceDate,
          originalTime: originalTime || undefined,
          requestedTime,
          explanation: explanation.trim(),
        } satisfies CorrectionSubmission;
      }
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
    <div className="space-y-4" data-testid="request-form" data-type={type}>
      {type === 'PERMISSION' && (
        <div className="space-y-1.5">
          <Label htmlFor="permission-type">Permission type</Label>
          <select
            id="permission-type"
            data-testid="permission-type"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={permissionCode}
            onChange={(e) => {
              setPermissionCode(e.target.value);
              setErrors({});
            }}
          >
            <option value="">Choose a type…</option>
            {permissionTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.permissionCode} />
          <p className="text-xs text-muted-foreground">Sick, family, late/early, emergency and company-defined types.</p>
        </div>
      )}

      {type === 'PERMISSION' && (
        <div className="space-y-1.5">
          <Label htmlFor="permission-date">Date</Label>
          <Input id="permission-date" type="date" data-testid="permission-date" value={date} onChange={(e) => setDate(e.target.value)} />
          <FieldError message={errors.date} />
        </div>
      )}

      {type === 'PERMISSION' && selectedPermission?.isTimed && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="permission-start">Start time</Label>
            <Input id="permission-start" type="time" data-testid="permission-start" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <FieldError message={errors.startTime} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="permission-end">End time</Label>
            <Input id="permission-end" type="time" data-testid="permission-end" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <FieldError message={errors.endTime} />
          </div>
        </div>
      )}

      {type === 'PERMISSION' && (
        <div className="space-y-1.5">
          <Label htmlFor="permission-reason">Reason</Label>
          <Input id="permission-reason" data-testid="permission-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <FieldError message={errors.reason} />
        </div>
      )}

      {type === 'OVERTIME' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="overtime-date">Date</Label>
            <Input id="overtime-date" type="date" data-testid="overtime-date" value={date} onChange={(e) => setDate(e.target.value)} />
            <FieldError message={errors.date} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="overtime-start">Planned start</Label>
              <Input id="overtime-start" type="time" data-testid="overtime-start" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <FieldError message={errors.startTime} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="overtime-end">Planned end</Label>
              <Input id="overtime-end" type="time" data-testid="overtime-end" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              <FieldError message={errors.endTime} />
            </div>
          </div>
          {overtimeHours > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="overtime-hours">
              ≈ {overtimeHours} planned hours (max {MAX_OVERTIME_HOURS}) — payable hours are confirmed after attendance reconciliation.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="overtime-reason">Reason</Label>
            <Input id="overtime-reason" data-testid="overtime-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <FieldError message={errors.reason} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="overtime-work">Work description</Label>
            <Input id="overtime-work" data-testid="overtime-work" value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} />
            <FieldError message={errors.workDescription} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="overtime-location">Work location / department (optional)</Label>
            <Input id="overtime-location" data-testid="overtime-location" value={locationText} onChange={(e) => setLocationText(e.target.value)} />
          </div>
        </>
      )}

      {type === 'ATTENDANCE_CORRECTION' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="correction-date">Attendance date</Label>
            <Input
              id="correction-date"
              type="date"
              data-testid="correction-date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
            />
            <FieldError message={errors.attendanceDate} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="correction-original">Recorded time (if known)</Label>
              <Input
                id="correction-original"
                type="time"
                data-testid="correction-original"
                value={originalTime}
                onChange={(e) => setOriginalTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correction-requested">Correct time</Label>
              <Input
                id="correction-requested"
                type="time"
                data-testid="correction-requested"
                value={requestedTime}
                onChange={(e) => setRequestedTime(e.target.value)}
              />
              <FieldError message={errors.requestedTime} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correction-explanation">What happened?</Label>
            <Input
              id="correction-explanation"
              data-testid="correction-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
            <FieldError message={errors.explanation} />
          </div>
          <p className="text-xs text-muted-foreground">
            The original attendance record is never changed — an approved correction is recorded as an auditable amendment.
          </p>
        </>
      )}

      <AttachmentPicker files={files} onChange={setFiles} error={errors.files} />

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="request-server-error"
        >
          {serverError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="request-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Submitting…' : 'Submit request'}
        </Button>
        <Button variant="outline" size="sm" data-testid="request-save-draft" disabled={busy} onClick={() => void saveDraftNow()}>
          Save draft
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
