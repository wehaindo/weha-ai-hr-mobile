'use client';

// Released performance history with comparison deltas. A pair whose
// methodology changed carries comparable=false — shown honestly, never as a
// misleading number.

import { Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PerformanceTrendItem } from '@/integration/ess/performance';
import { formatDay } from '@/lib/ess/performance/view-model';

function DeltaBadge({ item }: { item: PerformanceTrendItem }) {
  if (item.comparable === false) {
    return (
      <Badge variant="outline" data-testid="trend-not-comparable">
        not comparable
      </Badge>
    );
  }
  if (item.delta === null || item.delta === undefined) {
    return <Minus className="h-4 w-4 text-muted-foreground" aria-hidden />;
  }
  const positive = item.delta >= 0;
  return (
    <Badge variant={positive ? 'secondary' : 'destructive'} data-testid="trend-delta">
      {positive ? '+' : ''}
      {item.delta.toFixed(2)}
    </Badge>
  );
}

export function PerformanceTrendList({ trend }: { trend: PerformanceTrendItem[] }) {
  return (
    <Card data-testid="performance-trend">
      <CardHeader className="pb-2">
        <CardDescription>Released history</CardDescription>
        <CardTitle className="text-lg">Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="trend-empty">
            No released reviews yet. Your result appears here after you acknowledge it.
          </p>
        ) : (
          <ul className="divide-y" data-testid="trend-list">
            {trend.map((item) => (
              <li key={item.reviewId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.cycleName ?? 'Performance cycle'}</p>
                  <p className="text-xs text-muted-foreground">{formatDay(item.periodEnd)}</p>
                  {item.comparable === false && item.reason && (
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono font-medium" data-testid="trend-score">
                    {item.score === null || item.score === undefined ? '—' : item.score.toFixed(2)}
                  </span>
                  <DeltaBadge item={item} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
