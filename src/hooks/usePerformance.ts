'use client';

// Performance dashboard data for /performance: the latest PUBLISHED summary
// plus the released trend. Server-authored only; nothing persisted locally.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError } from '@/integration/ess/core';
import {
  createEssPerformanceApi,
  type PerformanceSummary,
  type PerformanceTrendItem,
} from '@/integration/ess/performance';

export type PerformanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; summary: PerformanceSummary | null; trend: PerformanceTrendItem[] }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export interface UsePerformance {
  state: PerformanceState;
  reload: () => void;
}

export function usePerformance(): UsePerformance {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<PerformanceState>({ status: 'idle' });
  const [nonce, setNonce] = useState(0);

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  useEffect(() => {
    if (session?.authSource !== 'mobile') {
      setState({ status: 'no_session' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const api = await createEssPerformanceApi(bridge);
        const result = await api.getMyPerformance();
        if (!cancelled) setState({ status: 'ready', summary: result.summary, trend: result.trend });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load performance.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, handleSessionExpired, nonce, session?.authSource]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { state, reload };
}
