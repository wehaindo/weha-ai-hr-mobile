'use client';

// SELF assessment form: rendered from the review's frozen template snapshot.
// Scores stay within each criterion's maxScore; N/A only applies to scored
// questions; mandatory questions need a score (the server validates again).

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PerformanceReview, ReviewCriterion, SelfAssessmentInput } from '@/integration/ess/performance';

interface CriterionState {
  score: string;
  na: boolean;
  comment: string;
}

export function SelfAssessmentForm({
  review,
  busy,
  error,
  onSubmit,
}: {
  review: PerformanceReview;
  busy: boolean;
  error?: string | null;
  onSubmit: (input: SelfAssessmentInput) => Promise<unknown>;
}) {
  const criteria: ReviewCriterion[] = review.templateVersion?.criteria ?? [];
  const allowMissing = review.templateVersion?.allowMissing === true;
  const [values, setValues] = useState<Record<string, CriterionState>>({});
  const [comments, setComments] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function stateFor(criterion: ReviewCriterion): CriterionState {
    return values[criterion.key] ?? { score: '', na: false, comment: '' };
  }

  function update(key: string, patch: Partial<CriterionState>): void {
    setValues((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { score: '', na: false, comment: '' }), ...patch },
    }));
  }

  async function submit(): Promise<void> {
    setFormError(null);
    const responses: SelfAssessmentInput['responses'] = [];
    for (const criterion of criteria) {
      const value = stateFor(criterion);
      const scored = criterion.isScored !== false;
      if (!scored) {
        responses.push({ criterionKey: criterion.key, score: null, comment: value.comment.trim() || null });
        continue;
      }
      if (value.na) {
        responses.push({ criterionKey: criterion.key, score: null, notApplicable: true, comment: value.comment.trim() || null });
        continue;
      }
      const score = value.score.trim() === '' ? null : Number(value.score);
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > criterion.maxScore)) {
        setFormError(`${criterion.label}: score must be between 0 and ${criterion.maxScore}.`);
        return;
      }
      if (score === null && criterion.mandatory !== false && !allowMissing) {
        setFormError(`${criterion.label}: a score is required.`);
        return;
      }
      responses.push({ criterionKey: criterion.key, score, comment: value.comment.trim() || null });
    }
    await onSubmit({ responses, comments: comments.trim() || null });
  }

  return (
    <Card data-testid="self-assessment-form">
      <CardHeader className="pb-2">
        <CardDescription>Self-assessment</CardDescription>
        <CardTitle className="text-lg">Rate yourself</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {criteria.length === 0 && (
          <p className="text-sm text-muted-foreground">This review template has no questions.</p>
        )}

        {criteria.map((criterion) => {
          const value = stateFor(criterion);
          const scored = criterion.isScored !== false;
          return (
            <div key={criterion.key} className="space-y-1.5 rounded-md border p-3" data-testid="criterion-row" data-key={criterion.key}>
              <div className="flex items-start justify-between gap-2">
                <Label className="text-sm">
                  {criterion.label}
                  {scored && criterion.mandatory !== false && !allowMissing && <span className="text-destructive"> *</span>}
                </Label>
                {scored && (
                  <span className="shrink-0 text-xs text-muted-foreground">max {criterion.maxScore}</span>
                )}
              </div>

              {scored && (
                <div className="flex items-center gap-2">
                  {(criterion.scoreLabels ?? []).length > 0 ? (
                    <select
                      data-testid="criterion-score"
                      className="h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={value.score}
                      disabled={value.na}
                      onChange={(e) => update(criterion.key, { score: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {(criterion.scoreLabels ?? []).map((option) => (
                        <option key={option.score} value={String(option.score)}>
                          {option.score} · {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      data-testid="criterion-score"
                      type="number"
                      min={0}
                      max={criterion.maxScore}
                      step="0.5"
                      className="h-10 flex-1"
                      placeholder={`0 – ${criterion.maxScore}`}
                      value={value.score}
                      disabled={value.na}
                      onChange={(e) => update(criterion.key, { score: e.target.value })}
                    />
                  )}
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      data-testid="criterion-na"
                      checked={value.na}
                      onChange={(e) => update(criterion.key, { na: e.target.checked })}
                    />
                    N/A
                  </label>
                </div>
              )}

              <Input
                data-testid="criterion-comment"
                className="h-10"
                placeholder={
                  criterion.requiresEvidence ? 'Evidence / details required' : 'Comment (optional)'
                }
                value={value.comment}
                onChange={(e) => update(criterion.key, { comment: e.target.value })}
              />
            </div>
          );
        })}

        <div className="space-y-1.5">
          <Label htmlFor="self-assessment-comments" className="text-sm">
            Overall comments
          </Label>
          <textarea
            id="self-assessment-comments"
            data-testid="self-assessment-comments"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>

        {(formError || error) && (
          <p className="text-sm text-destructive" role="alert" data-testid="self-assessment-error">
            {formError ?? error}
          </p>
        )}

        <Button size="sm" data-testid="self-assessment-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Submitting…' : 'Submit self-assessment'}
        </Button>
      </CardContent>
    </Card>
  );
}
