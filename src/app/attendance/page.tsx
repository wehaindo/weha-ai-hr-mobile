'use client';

import { EssPlaceholder } from '@/components/ess/ess-placeholder';
import { Badge } from '@/components/ui/badge';

export default function AttendancePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="attendance-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Attendance</h2>
        <p className="text-sm text-muted-foreground">
          Check-in/out and attendance history — backend integration lands in Phase 2
        </p>
      </div>

      <EssPlaceholder title="Today" subtitle="Sample day (not synced)">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Check-in 08:57 · Check-out —</span>
          <Badge>Present</Badge>
        </div>
      </EssPlaceholder>

      <EssPlaceholder title="This week" subtitle="5 of 6 workdays present (sample)">
        <p className="text-sm text-muted-foreground">
          Daily summaries, schedules and late marks arrive with the attendance API.
        </p>
      </EssPlaceholder>
    </div>
  );
}
