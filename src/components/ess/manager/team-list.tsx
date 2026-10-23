'use client';

// FR-601/602 team rows: name, department, today attendance badge, pending
// count — whitelisted fields only (no personal/salary data, BRD §8).

import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TeamMember } from '@/integration/ess/manager';
import { teamAttendanceView } from '@/lib/ess/manager/view-model';

export function TeamList({
  team,
  onSelect,
}: {
  team: TeamMember[];
  onSelect?: (member: TeamMember) => void;
}) {
  if (team.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="team-list-empty">
        No team members to show.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border" data-testid="team-list">
      {team.map((member) => {
        const attendance = teamAttendanceView(member.todayAttendance);
        return (
          <li key={member.employeeId}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
              data-testid="team-row"
              onClick={() => onSelect?.(member)}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium" data-testid="team-member-name">
                  {member.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {member.department ?? '—'}
                </span>
              </span>
              <Badge
                variant={attendance.variant}
                data-testid="team-attendance"
                data-calculated={attendance.calculated ? 'true' : 'false'}
              >
                {attendance.label}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground" data-testid="team-pending-count">
                {member.pendingCount} pending
              </span>
              {onSelect && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
