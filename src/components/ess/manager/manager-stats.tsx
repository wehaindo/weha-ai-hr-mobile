'use client';

// FR-601 stat cards: Team / Pending / Completed / Overdue — server counts.

import { Card, CardContent } from '@/components/ui/card';
import { toManagerStats } from '@/lib/ess/manager/view-model';

export function ManagerStats({
  teamCount,
  pendingCount,
  completed30d,
  overdueCount,
}: {
  teamCount: number;
  pendingCount: number;
  completed30d: number;
  overdueCount: number;
}) {
  const stats = toManagerStats({ teamCount, pendingCount, completed30d, overdueCount });

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="manager-stats">
      {stats.map((stat) => (
        <Card key={stat.key} data-testid={`manager-stat-${stat.key}`}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p
              className={`text-2xl font-bold tracking-tight ${
                stat.key === 'overdue' && stat.value > 0 ? 'text-destructive' : ''
              }`}
              data-testid={`manager-stat-${stat.key}-value`}
            >
              {stat.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
