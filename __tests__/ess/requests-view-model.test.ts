import { describe, expect, it } from 'vitest';
import {
  CANCELLABLE_STATUSES,
  formatAgeDays,
  formatRequestPeriod,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_ICON,
  REQUEST_TYPE_LABEL,
  toTimelineViews,
} from '@/lib/ess/requests/view-model';
import { ESS_REQUEST_STATUSES, ESS_REQUEST_TYPES } from '@/integration/ess/requests';

describe('request view model', () => {
  it('labels and variants exist for every status and type (BRD §6 completeness)', () => {
    for (const status of ESS_REQUEST_STATUSES) {
      expect(REQUEST_STATUS_LABEL[status]).toBeTruthy();
      expect(REQUEST_STATUS_VARIANT[status]).toBeTruthy();
    }
    for (const type of ESS_REQUEST_TYPES) {
      expect(REQUEST_TYPE_LABEL[type]).toBeTruthy();
      expect(REQUEST_TYPE_ICON[type]).toBeTruthy();
    }
  });

  it('formats leave ranges, single days and half-day notes', () => {
    expect(formatRequestPeriod('LEAVE', { start: '2026-11-02', end: '2026-11-04', halfDay: 'NONE' })).toContain('–');
    const single = formatRequestPeriod('LEAVE', { start: '2026-11-02', end: '2026-11-02', halfDay: 'FIRST' });
    expect(single).toContain('morning only');
    expect(formatRequestPeriod('LEAVE', null)).toBe('—');
  });

  it('formats timed permission/overtime windows', () => {
    const window_ = formatRequestPeriod('OVERTIME', { date: '2026-10-28', startTime: '18:00', endTime: '21:00' });
    expect(window_).toContain('18:00–21:00');
  });

  it('formats waiting age', () => {
    expect(formatAgeDays(0)).toBe('Today');
    expect(formatAgeDays(1)).toBe('1 day waiting');
    expect(formatAgeDays(3)).toBe('3 days waiting');
  });

  it('projects the approval timeline with human actions', () => {
    const views = toTimelineViews([
      { stepName: 'Direct manager', action: 'APPROVED', actorName: 'Sari', notes: 'OK', createdAt: '2026-10-22T08:00:00.000Z' },
      { stepName: 'HR review', action: 'RETURNED', actorName: null, notes: null, createdAt: '2026-10-22T09:00:00.000Z' },
    ]);

    expect(views[0].actionLabel).toBe('Approved');
    expect(views[1].actionLabel).toBe('Returned for correction');
    expect(views[1].actorName).toBe('System');
  });

  it('cancellable statuses are the pending-side states only (contract §3.8)', () => {
    expect(CANCELLABLE_STATUSES).toEqual(['SUBMITTED', 'IN_REVIEW', 'RETURNED']);
    expect(CANCELLABLE_STATUSES).not.toContain('APPROVED');
  });
});
