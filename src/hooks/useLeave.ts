'use client';

// Leave data for /leave: types + balances + own leave requests.
// Server-authoritative (balances, working days); session-expiry follows the
// Phase 2 convention (toast + logout + redirect).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError, type EssFilePart } from '@/integration/ess/core';
import {
  createEssRequestsApi,
  type EssLeaveBalance,
  type EssLeavePreview,
  type EssLeaveTypesResponse,
  type EssRequestSummary,
  type EssRequestsApi,
  type HalfDay,
  type LeaveSubmission,
  type PermissionSubmission,
} from '@/integration/ess/requests';

export type LeaveState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      types: EssLeaveTypesResponse;
      balances: EssLeaveBalance[];
    }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export interface UseLeave {
  state: LeaveState;
  reload: () => void;
  preview: (input: { leaveTypeId: string; startDate: string; endDate: string; halfDay?: HalfDay }) => Promise<EssLeavePreview>;
  submitLeave: (submission: LeaveSubmission, files?: EssFilePart[]) => Promise<EssRequestSummary>;
  submitPermission: (submission: PermissionSubmission, files?: EssFilePart[]) => Promise<EssRequestSummary>;
}

export function useLeave(): UseLeave {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<LeaveState>({ status: 'idle' });
  const [nonce, setNonce] = useState(0);

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  const ensureApi = useCallback(async (): Promise<EssRequestsApi> => createEssRequestsApi(bridge), [bridge]);

  /** Re-run session expiry handling, then propagate the original error. */
  const rethrow = useCallback(
    (err: unknown): never => {
      if (err instanceof EssApiError && err.isSessionExpired) handleSessionExpired();
      throw err;
    },
    [handleSessionExpired]
  );

  useEffect(() => {
    if (session?.authSource !== 'mobile') {
      setState({ status: 'no_session' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const api = await ensureApi();
        const [types, balances] = await Promise.all([api.getLeaveTypes(), api.getBalances()]);
        if (!cancelled) setState({ status: 'ready', types, balances });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load leave.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureApi, handleSessionExpired, nonce, session?.authSource]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const preview = useCallback(
    async (input: { leaveTypeId: string; startDate: string; endDate: string; halfDay?: HalfDay }): Promise<EssLeavePreview> => {
      const api = await ensureApi();
      try {
        return await api.previewLeave(input); // read-only — no reload
      } catch (err) {
        return rethrow(err);
      }
    },
    [ensureApi, rethrow]
  );

  const submit = useCallback(
    async <T,>(action: (api: EssRequestsApi) => Promise<T>): Promise<T> => {
      const api = await ensureApi();
      try {
        const result = await action(api);
        reload(); // submissions refresh types/balances/history (pending reservations)
        return result;
      } catch (err) {
        return rethrow(err);
      }
    },
    [ensureApi, reload, rethrow]
  );

  const submitLeave = useCallback(
    (submission: LeaveSubmission, files: EssFilePart[] = []) => submit((api) => api.submitLeave(submission, files)),
    [submit]
  );

  const submitPermission = useCallback(
    (submission: PermissionSubmission, files: EssFilePart[] = []) => submit((api) => api.submitPermission(submission, files)),
    [submit]
  );

  return { state, reload, preview, submitLeave, submitPermission };
}
