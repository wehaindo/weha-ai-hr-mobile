'use client';

// My reviews list: state badge, cycle, due hint and the available action.

import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PerformanceReview } from '@/integration/ess/performance';
import {
  REVIEW_STATE_LABEL,
  REVIEW_STATE_VARIANT,
  cycleLabel,
  displayName,
  formatDay,
  reviewAction,
} from '@/lib/ess/performance/view-model';

const ACTION_LABEL: Record<ReturnType<typeof reviewAction>, string> = {
  'self-assessment': 'Fill self-assessment',
  acknowledge: 'Review & acknowledge',
  none: '',
};

export function ReviewList({
  reviews,
  onOpen,
}: {
  reviews: PerformanceReview[];
  onOpen: (id: string) => void;
}) {
  return (
    <Card data-testid="reviews-list-card">
      <CardHeader className="pb-2">
        <CardDescription>Performance reviews</CardDescription>
        <CardTitle className="text-lg">My reviews</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="reviews-empty">
            No performance reviews yet — they appear here when HR opens a cycle.
          </p>
        ) : (
          <ul className="divide-y" data-testid="reviews-list">
            {reviews.map((review) => {
              const action = reviewAction(review);
              const selfAssignment = review.assignments?.find((item) => item.stage === 'SELF');
              return (
                <li key={review.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(review.id)}
                    data-testid="review-row"
                    data-state={review.state}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{cycleLabel(review.cycle)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {review.cycle?.periodStart ? `${formatDay(review.cycle.periodStart)} – ${formatDay(review.cycle.periodEnd)}` : ''}
                        {review.reviewer ? ` · ${displayName(review.reviewer)}` : ''}
                      </p>
                      {action !== 'none' && (
                        <p className="mt-0.5 text-xs font-medium text-primary" data-testid="review-action-label">
                          {ACTION_LABEL[action]}
                          {action === 'self-assessment' && selfAssignment?.dueAt
                            ? ` · due ${formatDay(selfAssignment.dueAt)}`
                            : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={REVIEW_STATE_VARIANT[review.state]} data-testid="review-state">
                        {REVIEW_STATE_LABEL[review.state]}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
