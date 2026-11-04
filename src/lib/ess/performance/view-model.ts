// View helpers for performance reviews (labels, formatting, list-state hints).

import type { ReviewState } from '@/integration/ess/performance';

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  DRAFT: 'Draft',
  SELF_ASSESSMENT: 'Self-assessment open',
  MANAGER_REVIEW: 'Manager review',
  SECONDARY_REVIEW: 'Second review',
  CALIBRATION: 'Calibration',
  FINALIZED: 'Result ready',
  ACKNOWLEDGED: 'Acknowledged',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const REVIEW_STATE_VARIANT: Record<ReviewState, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  DRAFT: 'outline',
  SELF_ASSESSMENT: 'default',
  MANAGER_REVIEW: 'secondary',
  SECONDARY_REVIEW: 'secondary',
  CALIBRATION: 'secondary',
  FINALIZED: 'default',
  ACKNOWLEDGED: 'outline',
  CLOSED: 'outline',
  CANCELLED: 'destructive',
};

/** What the employee can do right now on a review. */
export function reviewAction(review: {
  state: ReviewState;
  acknowledgedAt?: string | null;
}): 'self-assessment' | 'acknowledge' | 'none' {
  if (review.state === 'SELF_ASSESSMENT') return 'self-assessment';
  if (review.state === 'FINALIZED' && !review.acknowledgedAt) return 'acknowledge';
  return 'none';
}

export function displayName(person?: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null): string {
  if (!person) return '—';
  return (
    person.displayName?.trim() ||
    [person.firstName, person.lastName].filter(Boolean).join(' ').trim() ||
    '—'
  );
}

export function formatDay(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Summary JSON arrays may hold plain strings or `{label|title|text}` objects. */
export function summaryItemText(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    const value = record.label ?? record.title ?? record.text ?? record.name;
    if (typeof value === 'string') return value;
  }
  return '';
}

export function cycleLabel(cycle?: { name?: string | null; code?: string | null } | null): string {
  return cycle?.name?.trim() || cycle?.code?.trim() || 'Performance cycle';
}
