'use client';

// Payroll dashboard data for /payslips + the dashboard widget: summary,
// published periods, payments. All values server-authored; nothing persisted
// locally (BRD §6.1/§8.12).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError } from '@/integration/ess/core';
import {
  createEssPayrollApi,
  type EssPayrollApi,
  type PayrollDocument,
  type PayrollPaymentRow,
  type PayrollPeriodRow,
  type PayrollSummary,
} from '@/integration/ess/payroll';

export type PayrollState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      summary: PayrollSummary;
      periods: PayrollPeriodRow[];
      payments: PayrollPaymentRow[];
      documents: PayrollDocument[];
    }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export interface UsePayroll {
  state: PayrollState;
  year: number | undefined;
  setYear: (year: number | undefined) => void;
  reload: () => void;
}

export function usePayroll(): UsePayroll {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<PayrollState>({ status: 'idle' });
  const [year, setYear] = useState<number | undefined>(undefined);
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
        const api: EssPayrollApi = await createEssPayrollApi(bridge);
        const [summary, periods, payments, documents] = await Promise.all([
          api.getSummary(),
          api.getPeriods(year),
          api.getPayments(),
          api.getDocuments(year),
        ]);
        if (!cancelled) setState({ status: 'ready', summary, periods, payments, documents });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load payroll.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, handleSessionExpired, nonce, session?.authSource, year]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { state, year, setYear, reload };
}
