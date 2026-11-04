'use client';

// Latest published performance summary: score, rating, strengths and
// improvement areas, approved development recommendations and comments.

import { Award, Sparkles, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PerformanceSummary } from '@/integration/ess/performance';
import { cycleLabel, formatDay, summaryItemText } from '@/lib/ess/performance/view-model';

function ScoreRow({ label, value, testid }: { label: string; value: number | null | undefined; testid?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium" data-testid={testid}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

export function PerformanceSummaryCard({ summary }: { summary: PerformanceSummary }) {
  const strengths = (summary.strengths ?? []).map(summaryItemText).filter(Boolean);
  const improvements = (summary.improvementAreas ?? []).map(summaryItemText).filter(Boolean);

  return (
    <Card data-testid="performance-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>
            {cycleLabel(summary.cycle)} · published {formatDay(summary.publishedAt)}
          </CardDescription>
          <Badge data-testid="performance-rating">{summary.ratingLabel ?? summary.rating ?? '—'}</Badge>
        </div>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Award className="h-5 w-5 text-primary" aria-hidden />
          <span data-testid="performance-overall-score">{summary.overallScore.toFixed(2)}</span>
          <span className="text-xs font-normal text-muted-foreground">overall score</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <ScoreRow label="Self score" value={summary.selfScore} testid="performance-self-score" />
          <ScoreRow label="Manager score" value={summary.managerScore} testid="performance-manager-score" />
          <ScoreRow label="Previous score" value={summary.previousScore} />
          <ScoreRow label="KPI achievement" value={summary.kpiAchievement} />
        </div>

        {strengths.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Strengths
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm" data-testid="performance-strengths">
              {strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {improvements.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Improvement areas
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm" data-testid="performance-improvements">
              {improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {(summary.recommendations ?? []).length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Development recommendations
            </p>
            <ul className="space-y-1.5" data-testid="performance-recommendations">
              {summary.recommendations!.map((item) => (
                <li key={item.id} className="rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{item.title}</span>
                  {item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.managerComments && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manager comments</p>
            <p className="text-sm" data-testid="performance-manager-comments">
              {summary.managerComments}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
