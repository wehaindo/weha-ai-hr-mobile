'use client';

// Payroll summary widget (BRD §5.1 home surface): latest published net +
// payment status + link. Unpublished → honest empty state, never numbers.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createEssPayrollApi, type PayrollSummary } from '@/integration/ess/payroll';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_VARIANT } from '@/lib/ess/payroll/view-model';
import { formatIdr } from '@/lib/ess/payroll/money';
import type { EssWidgetProps } from '@/lib/ess/widgets/registry';

type WidgetState = 'loading' | 'no_session' | 'error' | 'ready';

export function PayrollSummaryWidget({ title }: EssWidgetProps) {
  const bridge = useBridge();
  const authSource = useAuthStore((s) => s.user?.authSource);
  const [widgetState, setWidgetState] = useState<WidgetState>('loading');
  const [summary, setSummary] = useState<PayrollSummary | null>(null);

  useEffect(() => {
    if (authSource !== 'mobile') {
      setWidgetState('no_session');
      return;
    }
    let cancelled = false;
    setWidgetState('loading');
    void (async () => {
      try {
        const api = await createEssPayrollApi(bridge);
        const result = await api.getSummary();
        if (!cancelled) {
          setSummary(result);
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

  return (
    <Card data-testid="widget-payroll-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          {widgetState === 'ready' && summary?.published && summary.latest && (
            <Badge variant={PAYMENT_STATUS_VARIANT[summary.latest.paymentStatus]}>
              {PAYMENT_STATUS_LABEL[summary.latest.paymentStatus]}
            </Badge>
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
          <p className="text-muted-foreground" data-testid="payroll-widget-no-session">
            Sign in with a WEHA account to see payslips.
          </p>
        )}
        {widgetState === 'error' && (
          <p className="text-muted-foreground" data-testid="payroll-widget-error">
            Could not load payroll right now.
          </p>
        )}
        {widgetState === 'ready' && summary?.published && summary.latest && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">{summary.latest.periodLabel}</span>
              <span className="text-lg font-bold tracking-tight" data-testid="payroll-widget-net">
                {formatIdr(summary.latest.netSalary)}
              </span>
            </div>
          </>
        )}
        {widgetState === 'ready' && !(summary?.published && summary.latest) && (
          <p className="text-muted-foreground" data-testid="payroll-widget-unpublished">
            No published payslip yet.
          </p>
        )}
        <Link href="/payslips" className="inline-flex items-center gap-1 text-xs font-medium underline" data-testid="payroll-widget-link">
          All payslips <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
