// Client-side validation mirror of docs/ESS-REQUESTS-CONTRACT.md §3/§4.1.
// Pure module — the SERVER is always the authority; these checks give instant
// feedback and prevent pointless submissions.

import type { EssLeaveType, EssPermissionType, HalfDay } from '@/integration/ess/requests';

export interface AttachmentFile {
  name: string;
  size: number;
  type: string;
}

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // contract §4.1
export const MAX_OVERTIME_HOURS = 16;
export const ATTACHMENT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

export type FieldErrors = Record<string, string>;

export interface LeaveForm {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay: HalfDay;
  reason: string;
  files: AttachmentFile[];
}

export interface PermissionForm {
  permissionCode: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  files: AttachmentFile[];
}

export interface OvertimeForm {
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  workDescription: string;
  locationText: string;
  files: AttachmentFile[];
}

export interface CorrectionForm {
  attendanceDate: string;
  originalTime: string;
  requestedTime: string;
  explanation: string;
  files: AttachmentFile[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

/** Hours between two HH:MM times on the same day (0 when invalid or inverted). */
export function hoursBetween(startTime: string, endTime: string): number {
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes <= 0 ? 0 : Math.round((minutes / 60) * 100) / 100;
}

export function validateAttachments(files: AttachmentFile[]): FieldErrors {
  const errors: FieldErrors = {};
  if (files.length > MAX_ATTACHMENTS) {
    errors.files = `Attach at most ${MAX_ATTACHMENTS} files.`;
  }
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.files = `"${file.name}" is larger than 5 MB.`;
      break;
    }
    if (!ATTACHMENT_MIME_TYPES.includes(file.type)) {
      errors.files = `"${file.name}" must be an image or PDF.`;
      break;
    }
  }
  return errors;
}

export function validateLeaveForm(form: LeaveForm, types: EssLeaveType[] = []): FieldErrors {
  const errors: FieldErrors = {};
  const type = types.find((t) => t.id === form.leaveTypeId);

  if (!form.leaveTypeId) errors.leaveTypeId = 'Choose a leave type.';
  if (!isValidDate(form.startDate)) errors.startDate = 'Enter a valid start date.';
  if (!isValidDate(form.endDate)) errors.endDate = 'Enter a valid end date.';
  if (!errors.startDate && !errors.endDate && form.endDate < form.startDate) {
    errors.endDate = 'The end date cannot be before the start date.';
  }
  if (form.halfDay !== 'NONE') {
    if (form.startDate !== form.endDate) {
      errors.halfDay = 'Half-day leave applies to a single day only.';
    }
    if (type && !type.halfDayAllowed) {
      errors.halfDay = `${type.name} does not allow half days.`;
    }
  }
  if (type?.maxConsecutiveDays && !errors.startDate && !errors.endDate && form.endDate >= form.startDate) {
    const days = Math.round((Date.parse(form.endDate) - Date.parse(form.startDate)) / 86_400_000) + 1;
    if (days > type.maxConsecutiveDays) {
      errors.endDate = `${type.name} is limited to ${type.maxConsecutiveDays} consecutive days.`;
    }
  }
  if (!form.reason.trim()) errors.reason = 'Enter a reason.';
  Object.assign(errors, validateAttachments(form.files));
  if (type?.requiresAttachment && form.files.length === 0) {
    errors.files = `${type.name} requires a supporting document.`;
  }
  return errors;
}

export function validatePermissionForm(form: PermissionForm, types: EssPermissionType[] = []): FieldErrors {
  const errors: FieldErrors = {};
  const type = types.find((t) => t.code === form.permissionCode);

  if (!form.permissionCode) errors.permissionCode = 'Choose a permission type.';
  if (!isValidDate(form.date)) errors.date = 'Enter a valid date.';
  if (type?.isTimed) {
    if (!TIME_RE.test(form.startTime)) errors.startTime = 'Enter a start time.';
    if (!TIME_RE.test(form.endTime)) errors.endTime = 'Enter an end time.';
    if (!errors.startTime && !errors.endTime && hoursBetween(form.startTime, form.endTime) <= 0) {
      errors.endTime = 'The end time must be after the start time.';
    }
  }
  if (!form.reason.trim()) errors.reason = 'Enter a reason.';
  Object.assign(errors, validateAttachments(form.files));
  if (type?.requiresAttachment && form.files.length === 0) {
    errors.files = `${type.name} requires a supporting document.`;
  }
  return errors;
}

export function validateOvertimeForm(form: OvertimeForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidDate(form.date)) errors.date = 'Enter a valid date.';
  if (!TIME_RE.test(form.startTime)) errors.startTime = 'Enter a start time.';
  if (!TIME_RE.test(form.endTime)) errors.endTime = 'Enter an end time.';
  if (!errors.startTime && !errors.endTime) {
    const hours = hoursBetween(form.startTime, form.endTime);
    if (hours <= 0) errors.endTime = 'The end time must be after the start time.';
    else if (hours > MAX_OVERTIME_HOURS) errors.endTime = `Overtime is capped at ${MAX_OVERTIME_HOURS} hours.`;
  }
  if (!form.reason.trim()) errors.reason = 'Enter a reason.';
  if (!form.workDescription.trim()) errors.workDescription = 'Describe the work planned.';
  Object.assign(errors, validateAttachments(form.files));
  return errors;
}

export function validateCorrectionForm(form: CorrectionForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidDate(form.attendanceDate)) errors.attendanceDate = 'Enter a valid date.';
  if (!TIME_RE.test(form.requestedTime)) errors.requestedTime = 'Enter the correct time.';
  if (form.originalTime && TIME_RE.test(form.originalTime) && form.originalTime === form.requestedTime) {
    errors.requestedTime = 'The requested time matches the recorded time.';
  }
  if (!form.explanation.trim()) errors.explanation = 'Explain what happened.';
  Object.assign(errors, validateAttachments(form.files));
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
