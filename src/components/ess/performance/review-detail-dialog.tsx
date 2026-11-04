'use client';

// One performance review in a dialog (the app has no dynamic routes — static
// export). Self-assessment while open, acknowledgement once finalized,
// read-only afterwards. All values are server-authored.

import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { SelfAssessmentForm } from './self-assessment-form';
import { AcknowledgePanel } from './acknowledge-panel';
import {
  REVIEW_STATE_LABEL,
  REVIEW_STATE_VARIANT,
  cycleLabel,
  displayName,
  formatDay,
  reviewAction,
} from '@/lib/ess/performance/view-model';
import { toast } from '@/components/ui/toast';
import type { PerformanceReview } from '@/integration/ess/performance';
import type { ReviewDetailState, UsePerformanceReviews } from '@/hooks/usePerformanceReviews';

function OwnResponses({ review }: { review: PerformanceReview }) {
  const responses = review.responses ?? [];
  const criteria = review.templateVersion?.criteria ?? [];
  if (responses.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answers</p>
      <div className="space-y-2" data-testid="review-responses">
        {responses.map((response, index) => {
          const criterion = criteria.find((item) => item.key === response.criterionKey);
          return (
            <div key={`${response.criterionKey ?? index}`} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{criterion?.label ?? response.criterionKey ?? 'Question'}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {response.notApplicable ? 'N/A' : (response.score ?? '—')}
                </span>
              </div>
              {response.comment && <p className="mt-0.5 text-xs text-muted-foreground">{response.comment}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ReviewDetailDialog({
  detail,
  reviews,
  open,
  onOpenChange,
  onRetry,
}: {
  detail: ReviewDetailState;
  reviews: Pick<UsePerformanceReviews, 'acting' | 'actError' | 'submitSelfAssessment' | 'acknowledge'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="review-detail">
        <DialogHeader>
          <DialogTitle>Performance review</DialogTitle>
          <DialogDescription>Self-assessment, final result and your own answers.</DialogDescription>
        </DialogHeader>

        {detail.status === 'loading' || detail.status === 'closed' ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : detail.status === 'error' ? (
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground" data-testid="review-error">
            <span>{detail.message}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : (
          (() => {
            const review = detail.review;
            const action = reviewAction(review);
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2" data-testid="review-header">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cycleLabel(review.cycle)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {review.cycle?.periodStart
                        ? `${formatDay(review.cycle.periodStart)} – ${formatDay(review.cycle.periodEnd)}`
                        : 'Performance cycle'}
                      {review.reviewer ? ` · ${displayName(review.reviewer)}` : ''}
                    </p>
                  </div>
                  <Badge variant={REVIEW_STATE_VARIANT[review.state]} data-testid="review-detail-state">
                    {REVIEW_STATE_LABEL[review.state]}
                  </Badge>
                </div>

                {action === 'self-assessment' && (
                  <SelfAssessmentForm
                    review={review}
                    busy={reviews.acting}
                    error={reviews.actError}
                    onSubmit={async (input) => {
                      await reviews.submitSelfAssessment(review.id, input);
                      toast.add({
                        title: 'Self-assessment submitted',
                        description: 'Your manager can now complete the review.',
                        type: 'success',
                      });
                    }}
                  />
                )}

                {action === 'acknowledge' && (
                  <AcknowledgePanel
                    review={review}
                    busy={reviews.acting}
                    error={reviews.actError}
                    onAcknowledge={async () => {
                      await reviews.acknowledge(review.id);
                      toast.add({
                        title: 'Result acknowledged',
                        description: 'Your performance summary is now published.',
                        type: 'success',
                      });
                    }}
                  />
                )}

                {action === 'none' && (
                  <p className="text-sm text-muted-foreground" data-testid="review-status-note">
                    {review.state === 'ACKNOWLEDGED' || review.state === 'CLOSED' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                        This review is complete — your result is published in the performance summary.
                      </span>
                    ) : review.state === 'MANAGER_REVIEW' ||
                      review.state === 'SECONDARY_REVIEW' ||
                      review.state === 'CALIBRATION' ? (
                      'Your review is in progress. You will be notified when it needs you again.'
                    ) : review.state === 'CANCELLED' ? (
                      'This review was cancelled.'
                    ) : (
                      'Nothing to do right now.'
                    )}
                  </p>
                )}

                <OwnResponses review={review} />
              </div>
            );
          })()
        )}
      </DialogContent>
    </Dialog>
  );
}
