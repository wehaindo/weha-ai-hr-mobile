'use client';

// Dashboard request-status grid: one card per request type with status counts
// derived from a single /ess/requests list call (newest-first). Honest
// loading / no-session / error states; nothing fabricated.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useRequests } from '@/hooks/useRequests';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ESS_REQUEST_TYPES,
  type EssRequestStatus,
  type EssRequestType,
} from '@/integration/ess/requests';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_ICON,
  REQUEST_TYPE_LABEL,
} from '@/lib/ess/requests/view-model';

const PENDING_STATUSES: readonly EssRequestStatus[] = ['SUBMITTED', 'IN_REVIEW', 'RETURNED'];

interface TypeCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  latestStatus?: EssRequestStatus;
}

function countByType(rows: { type: EssRequestType; status: EssRequestStatus }[]): Map<EssRequestType, TypeCounts> {
  const counts = new Map<EssRequestType, TypeCounts>();
  for (const row of rows) {
    const entry = counts.get(row.type) ?? { total: 0, pending: 0, approved: 0, rejected: 0 };
    entry.total += 1;
    if (PENDING_STATUSES.includes(row.status)) entry.pending += 1;
    if (row.status === 'APPROVED') entry.approved += 1;
    if (row.status === 'REJECTED') entry.rejected += 1;
    // list is newest-first; keep the first status seen per type
    entry.latestStatus ??= row.status;
    counts.set(row.type, entry);
  }
  return counts;
}

function TypeCard({ type, counts }: { type: EssRequestType; counts?: TypeCounts }) {
  const Icon = REQUEST_TYPE_ICON[type];
  return (
    <Card data-testid={`requests-card-${type.toLowerCase()}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="flex items-center gap-1.5">
            <Icon className="h-4 w-4" aria-hidden />
            {REQUEST_TYPE_LABEL[type]}
          </CardDescription>
          {counts?.latestStatus && (
            <Badge
              variant={REQUEST_STATUS_VARIANT[counts.latestStatus]}
              data-testid={`requests-card-status-${type.toLowerCase()}`}
            >
              {REQUEST_STATUS_LABEL[counts.latestStatus]}
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg" data-testid={`requests-card-total-${type.toLowerCase()}`}>
          {counts ? `${counts.total} request${counts.total === 1 ? '' : 's'}` : '—'}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {!counts || counts.total === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid={`requests-card-empty-${type.toLowerCase()}`}>
            None yet
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {counts.pending > 0 && <Badge variant="secondary" data-testid={`requests-card-pending-${type.toLowerCase()}`}>{counts.pending} pending</Badge>}
            {counts.approved > 0 && <Badge variant="outline" data-testid={`requests-card-approved-${type.toLowerCase()}`}>{counts.approved} approved</Badge>}
            {counts.rejected > 0 && <Badge variant="destructive" data-testid={`requests-card-rejected-${type.toLowerCase()}`}>{counts.rejected} rejected</Badge>}
            {counts.pending === 0 && counts.approved === 0 && counts.rejected === 0 && (
              <Badge variant="outline">Returned</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RequestStatusGrid() {
  const { state, reload } = useRequests();

  return (
    <section className="space-y-3" data-testid="request-status-grid">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Request status
        </h3>
        <Link
          href="/requests"
          className="inline-flex items-center gap-1 text-xs font-medium underline"
          data-testid="requests-grid-link"
        >
          All requests <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <div className="grid grid-cols-2 gap-4">
          {ESS_REQUEST_TYPES.map((type) => (
            <Card key={type}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-5 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : state.status === 'no_session' ? (
        <Card data-testid="requests-grid-no-session">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Sign in with a WEHA account to see your HR request statuses.
          </CardContent>
        </Card>
      ) : state.status === 'error' ? (
        <Card data-testid="requests-grid-error">
          <CardContent className="flex items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
            <span>Could not load your requests right now.</span>
            <button
              type="button"
              className="rounded-md border px-3 py-1 text-xs font-medium"
              onClick={reload}
              data-testid="requests-grid-retry"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      ) : (
        (() => {
          const counts = countByType(state.requests);
          return (
            <div className="grid grid-cols-2 gap-4">
              {ESS_REQUEST_TYPES.map((type) => (
                <TypeCard key={type} type={type} counts={counts.get(type)} />
              ))}
            </div>
          );
        })()
      )}
    </section>
  );
}
