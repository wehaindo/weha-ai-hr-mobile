'use client';

// My requests widget (BRD §7 recent requests + §4.5): pending count and the
// latest requests for a mobile session. Local accounts get a sign-in prompt;
// nothing is fabricated.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createEssRequestsApi, type EssRequestSummary } from '@/integration/ess/requests';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_VARIANT } from '@/lib/ess/requests/view-model';
import type { EssWidgetProps } from '@/lib/ess/widgets/registry';

type WidgetState = 'loading' | 'no_session' | 'error' | 'ready';

const PENDING_STATUSES = new Set(['SUBMITTED', 'IN_REVIEW', 'RETURNED']);

export function RequestsSummaryWidget({ title }: EssWidgetProps) {
  const bridge = useBridge();
  const authSource = useAuthStore((s) => s.user?.authSource);
  const [widgetState, setWidgetState] = useState<WidgetState>('loading');
  const [requests, setRequests] = useState<EssRequestSummary[]>([]);

  useEffect(() => {
    if (authSource !== 'mobile') {
      setWidgetState('no_session');
      return;
    }
    let cancelled = false;
    setWidgetState('loading');
    void (async () => {
      try {
        const api = await createEssRequestsApi(bridge);
        const list = await api.listRequests({ limit: 5 });
        if (!cancelled) {
          setRequests(list);
          setWidgetState('ready');
        }
      } catch {
        if (!cancelled) setWidgetState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, authSource]);

  const pending = requests.filter((r) => PENDING_STATUSES.has(r.status)).length;

  return (
    <Card data-testid="widget-requests-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          {widgetState === 'ready' && pending > 0 && (
            <Badge data-testid="requests-pending-count">{pending} pending</Badge>
          )}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {widgetState === 'loading' && (
          <>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </>
        )}
        {widgetState === 'no_session' && (
          <p className="text-muted-foreground" data-testid="requests-widget-no-session">
            Sign in with a WEHA account to see your HR requests.
          </p>
        )}
        {widgetState === 'error' && (
          <p className="text-muted-foreground" data-testid="requests-widget-error">
            Could not load your requests right now.
          </p>
        )}
        {widgetState === 'ready' && requests.length === 0 && (
          <p className="text-muted-foreground">No requests yet — submit leave, permission or overtime from Requests.</p>
        )}
        {widgetState === 'ready' &&
          requests.slice(0, 3).map((request) => (
            <div key={request.id} className="flex items-center justify-between gap-2" data-testid="requests-widget-row">
              <span className="truncate text-xs text-muted-foreground">{request.requestNo}</span>
              <Badge variant={REQUEST_STATUS_VARIANT[request.status]}>{REQUEST_STATUS_LABEL[request.status]}</Badge>
            </div>
          ))}
        <Link href="/requests" className="inline-flex items-center gap-1 text-xs font-medium underline" data-testid="requests-widget-link">
          All requests <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
