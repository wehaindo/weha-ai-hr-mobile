// View model for ESS requests: labels, badge variants, period formatting and
// the approval timeline projection. Pure display logic — statuses and data
// always come from the server (BRD §6: the client never derives them).

import { CalendarDays, CalendarX, Clock, Timer, Wrench, type LucideIcon } from 'lucide-react';
import type { EssRequestPeriod, EssRequestStatus, EssRequestType, EssTimelineItem } from '@/integration/ess/requests';

export const REQUEST_STATUS_LABEL: Record<EssRequestStatus, string> = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  RETURNED: 'Returned for correction',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const REQUEST_STATUS_VARIANT: Record<EssRequestStatus, BadgeVariant> = {
  SUBMITTED: 'secondary',
  IN_REVIEW: 'default',
  RETURNED: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
  COMPLETED: 'secondary',
};

export const REQUEST_TYPE_LABEL: Record<EssRequestType, string> = {
  LEAVE: 'Leave',
  PERMISSION: 'Permission',
  OVERTIME: 'Overtime',
  ATTENDANCE_CORRECTION: 'Attendance correction',
  LEAVE_CANCELLATION: 'Leave cancellation',
};

export const REQUEST_TYPE_ICON: Record<EssRequestType, LucideIcon> = {
  LEAVE: CalendarDays,
  PERMISSION: Clock,
  OVERTIME: Timer,
  ATTENDANCE_CORRECTION: Wrench,
  LEAVE_CANCELLATION: CalendarX,
};

/** Statuses the employee may cancel from (contract §3.8). */
export const CANCELLABLE_STATUSES: EssRequestStatus[] = ['SUBMITTED', 'IN_REVIEW', 'RETURNED'];

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDay(iso)} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

/** Human period: "2–4 Nov 2026", "30 Oct 2026 · 09:00–13:00", half-day notes. */
export function formatRequestPeriod(type: EssRequestType, period: EssRequestPeriod | null | undefined): string {
  if (!period) return '—';
  const halfDayNote = period.halfDay === 'FIRST' ? ' · morning only' : period.halfDay === 'SECOND' ? ' · afternoon only' : '';

  if (type === 'LEAVE' && period.start && period.end) {
    const start = new Date(period.start);
    const end = new Date(period.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
    if (period.start === period.end) return `${formatDay(period.start)}${halfDayNote}`;
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const startLabel = start.toLocaleDateString(undefined, { day: 'numeric', month: sameMonth ? undefined : 'short', year: sameMonth ? undefined : 'numeric' });
    const endLabel = end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startLabel} – ${endLabel}${halfDayNote}`;
  }

  const day = period.date ?? null;
  const window_ = period.startTime && period.endTime ? ` · ${period.startTime}–${period.endTime}` : '';
  return `${formatDay(day)}${window_}`;
}

export function formatAgeDays(ageDays: number): string {
  if (ageDays <= 0) return 'Today';
  if (ageDays === 1) return '1 day waiting';
  return `${ageDays} days waiting`;
}

export interface TimelineView {
  stepName: string;
  actionLabel: string;
  actorName: string;
  notes: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED: 'Returned for correction',
  PENDING: 'Awaiting review',
  CANCELLED: 'Cancelled',
  SKIPPED: 'Skipped',
};

export function toTimelineViews(timeline: EssTimelineItem[] | undefined): TimelineView[] {
  return (timeline ?? []).map((item) => ({
    stepName: item.stepName,
    actionLabel: ACTION_LABEL[item.action] ?? item.action,
    actorName: item.actorName ?? 'System',
    notes: item.notes ?? null,
    createdAt: item.createdAt,
  }));
}
