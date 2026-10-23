'use client';

// New payroll inquiry form (BRD §4.6): category, related period, subject,
// description, optional attachments. Idempotency key = stable per-mount id.

import { useState } from 'react';
import { generateId } from '@/lib/id';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EssApiError, type EssFilePart } from '@/integration/ess/core';
import {
  PAYROLL_INQUIRY_CATEGORIES,
  type PayrollInquiry,
  type PayrollInquiryCategory,
  type PayrollPeriodRow,
} from '@/integration/ess/payroll';
import { INQUIRY_CATEGORY_LABEL } from '@/lib/ess/payroll/view-model';
import { AttachmentPicker, toFileParts } from '@/components/ess/requests/attachment-picker';

const SERVER_ERROR_COPY: Record<string, string> = {
  validation: 'Please review the fields — the server rejected the submission.',
  conflict: 'This inquiry was already submitted.',
  attachment_required: 'An attachment is required for this category.',
  attachment_too_large: 'That file is larger than 5 MB.',
  unsupported_type: 'Attachments must be images or PDFs.',
};

export interface InquiryFormProps {
  periods: PayrollPeriodRow[];
  onSubmit: (
    submission: { idempotencyKey: string; category: PayrollInquiryCategory; periodId?: string; subject: string; description: string },
    files: EssFilePart[]
  ) => Promise<PayrollInquiry>;
  onCancel: () => void;
}

export function InquiryForm({ periods, onSubmit, onCancel }: InquiryFormProps) {
  const [idempotencyKey] = useState(() => generateId());
  const [category, setCategory] = useState<PayrollInquiryCategory | ''>('');
  const [periodId, setPeriodId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setServerError(null);
    const nextErrors: Record<string, string> = {};
    if (!category) nextErrors.category = 'Choose a category.';
    if (!subject.trim()) nextErrors.subject = 'Enter a subject.';
    if (!description.trim()) nextErrors.description = 'Describe the issue.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      await onSubmit(
        {
          idempotencyKey,
          category: category as PayrollInquiryCategory,
          periodId: periodId || undefined,
          subject: subject.trim(),
          description: description.trim(),
        },
        await toFileParts(files)
      );
    } catch (err) {
      if (err instanceof EssApiError && err.domainCode && SERVER_ERROR_COPY[err.domainCode]) {
        setServerError(SERVER_ERROR_COPY[err.domainCode]);
      } else if (err instanceof EssApiError && err.code === 'validation') {
        setServerError(err.message);
      } else {
        setServerError(err instanceof Error ? err.message : 'Could not submit the inquiry.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="inquiry-form">
      <div className="space-y-1.5">
        <Label htmlFor="inquiry-category">Category</Label>
        <select
          id="inquiry-category"
          data-testid="inquiry-category"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as PayrollInquiryCategory | '');
            setErrors({});
          }}
        >
          <option value="">Choose a category…</option>
          {PAYROLL_INQUIRY_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {INQUIRY_CATEGORY_LABEL[value]}
            </option>
          ))}
        </select>
        {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inquiry-period">Related payroll period (optional)</Label>
        <select
          id="inquiry-period"
          data-testid="inquiry-period"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
        >
          <option value="">None</option>
          {periods.map((period) => (
            <option key={period.periodId} value={period.periodId}>
              {period.periodLabel}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inquiry-subject">Subject</Label>
        <Input id="inquiry-subject" data-testid="inquiry-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inquiry-description">Description</Label>
        <Textarea
          id="inquiry-description"
          data-testid="inquiry-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
      </div>

      <AttachmentPicker files={files} onChange={setFiles} />

      {serverError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="inquiry-server-error">
          {serverError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="inquiry-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Submitting…' : 'Submit inquiry'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
