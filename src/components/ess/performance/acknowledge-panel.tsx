'use client';

// Acknowledge a FINALIZED review. Acknowledgement is the publish gate: only
// then does the result enter the employee's performance history.

import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PerformanceReview } from '@/integration/ess/performance';
import { formatDay } from '@/lib/ess/performance/view-model';

export function AcknowledgePanel({
  review,
  busy,
  error,
  onAcknowledge,
}: {
  review: PerformanceReview;
  busy: boolean;
  error?: string | null;
  onAcknowledge: () => Promise<unknown>;
}) {
  const acknowledged = Boolean(review.acknowledgedAt);

  return (
    <Card data-testid="acknowledge-panel">
      <CardHeader className="pb-2">
        <CardDescription>Final result</CardDescription>
        <CardTitle className="text-lg">{acknowledged ? 'Acknowledged' : 'Review your result'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {acknowledged
            ? `Acknowledged on ${formatDay(review.acknowledgedAt)} — your result is published to your performance history.`
            : 'Acknowledging confirms you have seen this result. It publishes your final score and rating to your performance history.'}
        </p>
        {!acknowledged && (
          <Button size="sm" data-testid="acknowledge-review" disabled={busy} onClick={() => void onAcknowledge()}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
            {busy ? 'Acknowledging…' : 'Acknowledge result'}
          </Button>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert" data-testid="acknowledge-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
