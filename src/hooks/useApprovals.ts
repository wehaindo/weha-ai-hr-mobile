'use client';

// Manager approval inbox for /approvals: server-scoped pending tasks with
// filters + cursor pagination (FR-602), approver detail (leave/correction
// contexts), and decisions carrying expectedVersion + a fresh idempotency
// key per attempt (FR-605, contract §4.5). Version conflicts reload the
// detail instead of blind-retrying.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { generateId } from '@/lib/id';
import { EssApiError } from '@/integration/ess/core';
import {
  createEssRequestsApi,
  type ApprovalInboxFilters,
  type DecisionAction,
  type EssApprovalDetail,
  type EssDecisionResult,
  type EssInboxItem,
  type EssRequestsApi,
} from '@/integration/ess/requests';

export type ApprovalsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; inbox: EssInboxItem[]; nextCursor: string | null }
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
  filters: ApprovalInboxFilters;
  setFilters: (filters: ApprovalInboxFilters) => void;
  loadMore: () => void;
  reload: () => void;
  openDetail: (requestId: string) => void;
  closeDetail: () => void;
  decide: (
    requestId: string,
    action: DecisionAction,
    options?: { notes?: string; expectedVersion?: number }
  ) => Promise<EssDecisionResult>;
  /** Authorized attachment download for approval detail (record-scoped). */
  download: (requestId: string, attachmentId: string) => Promise<{ base64: string; fileName: string; mimeType?: string | null }>;
}

export function useApprovals(): UseApprovals {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<ApprovalsState>({ status: 'idle' });
  const [detail, setDetail] = useState<ApprovalDetailState>({ status: 'closed' });
  const [filters, setFiltersState] = useState<ApprovalInboxFilters>({});
  const [cursor, setCursor] = useState<string | undefined>(undefined);
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
    // keep the current rows visible while an append (cursor) fetch runs —
    // flipping to loading would drop the list and defeat the append guard
    setState((prev) => (cursor && prev.status === 'ready' ? prev : { status: 'loading' }));
    void (async () => {
      try {
        const api = await ensureApi();
        const page = await api.getInbox(filters, cursor); // server-scoped + filtered
        if (cancelled) return;
        setState((prev) => ({
          status: 'ready',
          // load-more appends; a filter/nonce change replaces
          inbox: cursor && prev.status === 'ready' ? [...prev.inbox, ...page.items] : page.items,
          nextCursor: page.nextCursor,
        }));
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
  }, [cursor, ensureApi, filters, handleSessionExpired, nonce, session?.authSource]);

  const reload = useCallback(() => {
    setDetail({ status: 'closed' });
    setCursor(undefined);
    setNonce((n) => n + 1);
  }, []);

  const setFilters = useCallback((next: ApprovalInboxFilters) => {
    setFiltersState(next);
    setCursor(undefined);
    setNonce((n) => n + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || !state.nextCursor) return;
    // a repeated click with the same cursor is a state-set bails-out —
    // the effect runs once per distinct cursor
    setCursor(state.nextCursor);
  }, [state]);

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
    async (
      requestId: string,
      action: DecisionAction,
      options: { notes?: string; expectedVersion?: number } = {}
    ): Promise<EssDecisionResult> => {
      const api = await ensureApi();
      try {
        const result = await api.decide(
          requestId,
          { action, notes: options.notes, expectedVersion: options.expectedVersion },
          generateId() // one idempotency key per user action attempt
        );
        reload(); // the acted item leaves the inbox
        return result;
      } catch (err) {
        if (err instanceof EssApiError && err.domainCode === 'version_conflict') {
          toast.add({
            title: 'This request changed',
            description: 'Review the latest state before deciding again.',
            type: 'warning',
          });
          openDetail(requestId); // reload behind the dialog — never blind-retry
        }
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
        }
        throw err;
      }
    },
    [ensureApi, handleSessionExpired, openDetail, reload]
  );

  const download = useCallback(
    (requestId: string, attachmentId: string) =>
      ensureApi().then((api) => api.downloadAttachment(requestId, attachmentId)),
    [ensureApi]
  );

  return { state, detail, filters, setFilters, loadMore, reload, openDetail, closeDetail, decide, download };
}
