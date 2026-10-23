import { describe, expect, it } from 'vitest';
import {
  TEAM_ATTENDANCE_LABEL,
  TEAM_ATTENDANCE_VARIANT,
  formatDelegationWindow,
  teamAttendanceView,
  toManagerStats,
} from '@/lib/ess/manager/view-model';
import { TEAM_ATTENDANCE_STATUSES } from '@/integration/ess/manager';
import {
  APPROVAL_ACTION_LABEL,
  actionRequiresComment,
} from '@/lib/ess/requests/view-model';

describe('manager view model', () => {
  it('labels and variants exist for every HRD attendance status (completeness)', () => {
    for (const status of TEAM_ATTENDANCE_STATUSES) {
      expect(TEAM_ATTENDANCE_LABEL[status]).toBeTruthy();
      expect(TEAM_ATTENDANCE_VARIANT[status]).toBeTruthy();
    }
  });

  it('team attendance distinguishes not-yet-calculated (null) from real statuses', () => {
    const uncalculated = teamAttendanceView(null);
    expect(uncalculated.calculated).toBe(false);
    expect(uncalculated.label).toBe('Not yet calculated');

    const present = teamAttendanceView({ status: 'PRESENT', checkIn: '08:01', checkOut: null });
    expect(present.calculated).toBe(true);
    expect(present.label).toBe('Present');
    expect(present.variant).toBe('default');

    const absent = teamAttendanceView({ status: 'ABSENT' });
    expect(absent.variant).toBe('destructive');
  });

  it('stat cards keep the FR-601 order', () => {
    const stats = toManagerStats({ teamCount: 8, pendingCount: 3, completed30d: 12, overdueCount: 1 });
    expect(stats.map((s) => s.key)).toEqual(['team', 'pending', 'completed', 'overdue']);
    expect(stats[3].value).toBe(1);
  });

  it('formats a delegation window with its form-type scope', () => {
    const window_ = formatDelegationWindow({
      id: 'del-1',
      direction: 'INBOUND',
      counterpart: { id: 'e-9', name: 'Pak Boss' },
      startsAt: '2026-11-01T00:00:00.000Z',
      endsAt: '2026-11-07T23:59:59.000Z',
      formTypes: ['LEAVE'],
      isActive: true,
    });
    expect(window_).toContain('–');
    expect(window_).toContain('LEAVE');
    expect(
      formatDelegationWindow({
        id: 'd2',
        direction: 'OUTBOUND',
        counterpart: { id: 'x', name: 'Y' },
        startsAt: '2026-11-01T00:00:00.000Z',
        endsAt: '2026-11-02T00:00:00.000Z',
        formTypes: null,
        isActive: true,
      })
    ).not.toContain('·');
  });
});

describe('approval action labels', () => {
  it('labels all actions; only approval may skip the comment', () => {
    for (const action of ['APPROVED', 'REJECTED', 'RETURNED'] as const) {
      expect(APPROVAL_ACTION_LABEL[action]).toBeTruthy();
    }
    expect(actionRequiresComment('APPROVED')).toBe(false);
    expect(actionRequiresComment('REJECTED')).toBe(true);
    expect(actionRequiresComment('RETURNED')).toBe(true);
  });
});
