// Manager dashboard view model: team attendance labels (HRD
// AttendanceStatus), stat-card copy, delegation windows. Pure display —
// counts and statuses are server projections (contract §4.1).

import type { ApprovalDelegationView, TeamAttendance } from '@/integration/ess/manager';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const TEAM_ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  HALF_DAY: 'Half day',
  ON_LEAVE: 'On leave',
  HOLIDAY: 'Holiday',
  REST_DAY: 'Rest day',
  INCOMPLETE: 'Incomplete',
};

export const TEAM_ATTENDANCE_VARIANT: Record<string, BadgeVariant> = {
  PRESENT: 'default',
  ABSENT: 'destructive',
  LATE: 'secondary',
  HALF_DAY: 'outline',
  ON_LEAVE: 'secondary',
  HOLIDAY: 'outline',
  REST_DAY: 'outline',
  INCOMPLETE: 'secondary',
};

/** null → the backend has not calculated today yet (never fabricated). */
export function teamAttendanceView(
  attendance: TeamAttendance | null | undefined
): { label: string; variant: BadgeVariant; calculated: boolean } {
  if (!attendance) return { label: 'Not yet calculated', variant: 'outline', calculated: false };
  return {
    label: TEAM_ATTENDANCE_LABEL[attendance.status] ?? attendance.status,
    variant: TEAM_ATTENDANCE_VARIANT[attendance.status] ?? 'secondary',
    calculated: true,
  };
}

export interface ManagerStat {
  key: 'team' | 'pending' | 'completed' | 'overdue';
  label: string;
  value: number;
}

export function toManagerStats(input: {
  teamCount: number;
  pendingCount: number;
  completed30d: number;
  overdueCount: number;
}): ManagerStat[] {
  return [
    { key: 'team', label: 'Team', value: input.teamCount },
    { key: 'pending', label: 'Pending', value: input.pendingCount },
    { key: 'completed', label: 'Completed (30d)', value: input.completed30d },
    { key: 'overdue', label: 'Overdue', value: input.overdueCount },
  ];
}

export function formatDelegationWindow(delegation: ApprovalDelegationView): string {
  const start = new Date(delegation.startsAt);
  const end = new Date(delegation.endsAt);
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const scope = delegation.formTypes?.length ? ` · ${delegation.formTypes.join(', ')}` : '';
  return `${day(start)} – ${day(end)}${scope}`;
}
