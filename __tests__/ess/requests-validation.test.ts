import { describe, expect, it } from 'vitest';
import {
  hoursBetween,
  hasErrors,
  validateAttachments,
  validateCorrectionForm,
  validateLeaveForm,
  validateOvertimeForm,
  validatePermissionForm,
  type AttachmentFile,
  type CorrectionForm,
  type LeaveForm,
  type OvertimeForm,
} from '@/lib/ess/requests/validation';
import type { EssLeaveType, EssPermissionType } from '@/integration/ess/requests';

const ANNUAL: EssLeaveType = {
  id: 'lt_annual',
  code: 'ANNUAL',
  name: 'Annual leave',
  unit: 'DAYS',
  halfDayAllowed: true,
  requiresAttachment: false,
  consumesBalance: true,
  maxConsecutiveDays: null,
};

const SICK_TYPED: EssPermissionType = { code: 'sick', name: 'Sick', requiresAttachment: true, consumesBalance: true, isTimed: false };
const LATE: EssPermissionType = { code: 'late', name: 'Late arrival', requiresAttachment: false, consumesBalance: false, isTimed: true };

const leaveForm = (overrides: Partial<LeaveForm> = {}): LeaveForm => ({
  leaveTypeId: 'lt_annual',
  startDate: '2026-11-02',
  endDate: '2026-11-04',
  halfDay: 'NONE',
  reason: 'Family holiday',
  files: [],
  ...overrides,
});

describe('hoursBetween', () => {
  it('computes same-day windows and rejects inverted/invalid input', () => {
    expect(hoursBetween('09:00', '13:00')).toBe(4);
    expect(hoursBetween('18:30', '21:00')).toBe(2.5);
    expect(hoursBetween('13:00', '09:00')).toBe(0);
    expect(hoursBetween('25:00', '26:00')).toBe(0);
  });
});

describe('validateLeaveForm (BRD §4.1 mirror)', () => {
  it('accepts a valid range', () => {
    expect(hasErrors(validateLeaveForm(leaveForm(), [ANNUAL]))).toBe(false);
  });

  it('requires a type, valid dates and a reason; end before start fails', () => {
    expect(validateLeaveForm(leaveForm({ leaveTypeId: '' }), [ANNUAL]).leaveTypeId).toBeDefined();
    expect(validateLeaveForm(leaveForm({ startDate: 'nope' }), [ANNUAL]).startDate).toBeDefined();
    const reversed = validateLeaveForm(leaveForm({ startDate: '2026-11-04', endDate: '2026-11-02' }), [ANNUAL]);
    expect(reversed.endDate).toContain('cannot be before');
    expect(validateLeaveForm(leaveForm({ reason: '  ' }), [ANNUAL]).reason).toBeDefined();
  });

  it('half-day must be a single day and allowed by the type', () => {
    const single = validateLeaveForm(leaveForm({ endDate: '2026-11-02', halfDay: 'FIRST' }), [ANNUAL]);
    expect(hasErrors(single)).toBe(false);

    const multi = validateLeaveForm(leaveForm({ halfDay: 'SECOND' }), [ANNUAL]);
    expect(multi.halfDay).toContain('single day');

    const strict = validateLeaveForm(leaveForm({ endDate: '2026-11-02', halfDay: 'FIRST' }), [
      { ...ANNUAL, halfDayAllowed: false },
    ]);
    expect(strict.halfDay).toContain('does not allow half days');
  });

  it('enforces the type max consecutive days', () => {
    const errors = validateLeaveForm(leaveForm({ endDate: '2026-11-30' }), [{ ...ANNUAL, maxConsecutiveDays: 5 }]);
    expect(errors.endDate).toContain('limited to 5');
  });

  it('requires an attachment when the type demands one', () => {
    const errors = validateLeaveForm(leaveForm({ leaveTypeId: 'lt_sick' }), [{ ...ANNUAL, id: 'lt_sick', requiresAttachment: true }]);
    expect(errors.files).toContain('requires a supporting document');
  });
});

describe('validatePermissionForm', () => {
  it('time-window types require valid times in order', () => {
    const ok = validatePermissionForm(
      { permissionCode: 'late', date: '2026-10-30', startTime: '09:00', endTime: '10:00', reason: 'Traffic', files: [] },
      [LATE]
    );
    expect(hasErrors(ok)).toBe(false);

    const inverted = validatePermissionForm(
      { permissionCode: 'late', date: '2026-10-30', startTime: '10:00', endTime: '09:00', reason: 'Traffic', files: [] },
      [LATE]
    );
    expect(inverted.endTime).toContain('after the start');

    const missing = validatePermissionForm(
      { permissionCode: 'late', date: '2026-10-30', startTime: '', endTime: '', reason: '', files: [] },
      [LATE]
    );
    expect(missing.startTime).toBeDefined();
    expect(missing.reason).toBeDefined();
  });

  it('non-timed types do not require times and enforce attachments', () => {
    const errors = validatePermissionForm(
      { permissionCode: 'sick', date: '2026-10-30', startTime: '', endTime: '', reason: 'Fever', files: [] },
      [SICK_TYPED]
    );
    expect(errors.files).toContain('requires a supporting document');
  });
});

describe('validateOvertimeForm', () => {
  const form = (overrides: Partial<OvertimeForm> = {}): OvertimeForm => ({
    date: '2026-10-28',
    startTime: '18:00',
    endTime: '21:00',
    reason: 'Stock opname',
    workDescription: 'Counting stock',
    locationText: 'Warehouse',
    files: [],
    ...overrides,
  });

  it('accepts a valid window and requires work description', () => {
    expect(hasErrors(validateOvertimeForm(form()))).toBe(false);
    expect(validateOvertimeForm(form({ workDescription: ' ' })).workDescription).toBeDefined();
  });

  it('caps the window at 16 hours and rejects inverted times', () => {
    expect(validateOvertimeForm(form({ endTime: '12:00' })).endTime).toContain('after the start');
    expect(validateOvertimeForm(form({ startTime: '06:00', endTime: '23:00' })).endTime).toContain('capped at 16');
  });
});

describe('validateCorrectionForm (BRD §4.4 mirror)', () => {
  const form = (overrides: Partial<CorrectionForm> = {}): CorrectionForm => ({
    attendanceDate: '2026-10-27',
    originalTime: '08:00',
    requestedTime: '07:58',
    explanation: 'Scanner was down at the gate',
    files: [],
    ...overrides,
  });

  it('accepts a valid correction', () => {
    expect(hasErrors(validateCorrectionForm(form()))).toBe(false);
  });

  it('rejects a requested time equal to the recorded one and empty explanations', () => {
    expect(validateCorrectionForm(form({ requestedTime: '08:00' })).requestedTime).toContain('matches the recorded');
    expect(validateCorrectionForm(form({ explanation: ' ' })).explanation).toBeDefined();
  });
});

describe('validateAttachments', () => {
  const file = (overrides: Partial<AttachmentFile> = {}): AttachmentFile => ({
    name: 'surat.pdf',
    size: 1024,
    type: 'application/pdf',
    ...overrides,
  });

  it('accepts images/PDFs within limits and rejects the rest', () => {
    expect(hasErrors(validateAttachments([file(), file({ name: 'foto.png', type: 'image/png' })]))).toBe(false);
    expect(validateAttachments([file({ size: 6 * 1024 * 1024 })]).files).toContain('larger than 5 MB');
    expect(validateAttachments([file({ type: 'application/zip' })]).files).toContain('must be an image or PDF');
    expect(validateAttachments([file({ name: 'a' }), file({ name: 'b' }), file({ name: 'c' }), file({ name: 'd' })]).files).toContain('at most 3');
  });
});
