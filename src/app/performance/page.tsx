'use client';

// Performance (ESS/Talent): the latest published summary, the released trend
// and every review the employee owns — with the self-assessment and
// acknowledgement entry points.

import { useState } from 'react';
import { usePerformance } from '@/hooks/usePerformance';
import { usePerformanceReviews } from '@/hooks/usePerformanceReviews';
import { PerformanceSummaryCard } from '@/components/ess/performance/summary-card';
import { PerformanceTrendList } from '@/components/ess/performance/trend-list';
import { ReviewList } from '@/components/ess/performance/review-list';
import { ReviewDetailDialog } from '@/components/ess/performance/review-detail-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function PerformancePage() {
  const performance = usePerformance();
  const reviews = usePerformanceReviews();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="performance-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Performance</h2>
        <p className="text-sm text-muted-foreground">
          Your published results, released history and reviews awaiting your input.
        </p>
      </div>

      {performance.state.status === 'loading' || performance.state.status === 'idle' ? (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ) : performance.state.status === 'no_session' ? (
        <Card data-testid="performance-no-session">
          <CardHeader className="pb-2">
            <CardDescription>Performance</CardDescription>
            <CardTitle className="text-lg">No employee session on this device</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sign in with your WEHA account to see your performance results and reviews.
          </CardContent>
        </Card>
      ) : performance.state.status === 'error' ? (
        <Card data-testid="performance-error">
          <CardHeader className="pb-2">
            <CardDescription>Performance</CardDescription>
            <CardTitle className="text-lg">Could not load performance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{performance.state.error.message}</span>
            <Button variant="outline" size="sm" onClick={performance.reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {performance.state.summary ? (
            <PerformanceSummaryCard summary={performance.state.summary} />
          ) : (
            <Card data-testid="performance-no-summary">
              <CardHeader className="pb-2">
                <CardDescription>Published result</CardDescription>
                <CardTitle className="text-lg">No published result yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Your score and rating appear here once a review is finalized and you acknowledge it.
              </CardContent>
            </Card>
          )}

          <PerformanceTrendList trend={performance.state.trend} />
        </>
      )}

      {reviews.list.status === 'ready' ? (
        <ReviewList
          reviews={reviews.list.reviews}
          onOpen={(id) => {
            setOpenId(id);
            reviews.openDetail(id);
          }}
        />
      ) : reviews.list.status === 'error' ? (
        <Card data-testid="reviews-error">
          <CardContent className="flex items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
            <span>{reviews.list.error.message}</span>
            <Button variant="outline" size="sm" onClick={reviews.reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : reviews.list.status === 'no_session' ? null : (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      )}

      <ReviewDetailDialog
        detail={reviews.detail}
        reviews={reviews}
        open={reviews.detail.status !== 'closed'}
        onOpenChange={(open) => {
          if (!open) {
            reviews.closeDetail();
            setOpenId(null);
          }
        }}
        onRetry={() => {
          if (openId) reviews.openDetail(openId);
        }}
      />
    </div>
  );
}
