'use client';

// Manager approval inbox for /approvals: pending items scoped by the server
// (the engine resolves approver slots from the token's employee id), approver
// detail, and decisions (approve / reject / return for correction).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError } from '@/integration/ess/core';
import {
  createEssRequestsApi,
  type DecisionAction,
  type EssApprovalDetail,
  type EssDecisionResult,
  type EssInboxItem,
  type EssRequestsApi,
} from '@/integration/ess/requests';

export type ApprovalsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; inbox: EssInboxItem[] }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export type ApprovalDetailState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'ready'; approval: EssApprovalDetail }
  | { status: 'error'; message: string };

export interface UseApprovals {
  state: ApprovalsState;
  detail: ApprovalDetailState;
  reload: () => void;
  openDetail: (requestId: string) => void;
  closeDetail: () => void;
  decide: (requestId: string, action: DecisionAction, notes?: string) => Promise<EssDecisionResult>;
}

export function useApprovals(): UseApprovals {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<ApprovalsState>({ status: 'idle' });
  const [detail, setDetail] = useState<ApprovalDetailState>({ status: 'closed' });
  const [nonce, setNonce] = useState(0);

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  const ensureApi = useCallback(async (): Promise<EssRequestsApi> => createEssRequestsApi(bridge), [bridge]);

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
        const inbox = await api.getInbox(); // server-scoped to the approver
        if (!cancelled) setState({ status: 'ready', inbox });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load approvals.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureApi, handleSessionExpired, nonce, session?.authSource]);

  const reload = useCallback(() => {
    setDetail({ status: 'closed' });
    setNonce((n) => n + 1);
  }, []);

  const openDetail = useCallback(
    (requestId: string) => {
      setDetail({ status: 'loading' });
      void (async () => {
        try {
          const api = await ensureApi();
          const approval = await api.getApproval(requestId);
          setDetail({ status: 'ready', approval });
        } catch (err) {
          if (err instanceof EssApiError && err.isSessionExpired) {
            handleSessionExpired();
            return;
          }
          setDetail({ status: 'error', message: err instanceof Error ? err.message : 'Could not load the request.' });
        }
      })();
    },
    [ensureApi, handleSessionExpired]
  );

  const closeDetail = useCallback(() => setDetail({ status: 'closed' }), []);

  const decide = useCallback(
    async (requestId: string, action: DecisionAction, notes?: string): Promise<EssDecisionResult> => {
      const api = await ensureApi();
      try {
        const result = await api.decide(requestId, { action, notes });
        reload(); // the acted item leaves the inbox
        return result;
      } catch (err) {
        if (err instanceof EssApiError && err.isSessionExpired) handleSessionExpired();
        throw err;
      }
    },
    [ensureApi, handleSessionExpired, reload]
  );

  return { state, detail, reload, openDetail, closeDetail, decide };
}
