'use client';

// Consolidated request history for /requests: filtered list + selected
// detail (timeline/attachments) + cancel/resubmit actions.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError, type EssFilePart } from '@/integration/ess/core';
import {
  createEssRequestsApi,
  type AnySubmission,
  type CorrectionSubmission,
  type EssAttachmentFile,
  type EssRequestStatus,
  type EssRequestSummary,
  type EssRequestType,
  type EssRequestsApi,
  type OvertimeSubmission,
  type PermissionSubmission,
} from '@/integration/ess/requests';

export interface RequestFilters {
  status?: EssRequestStatus;
  type?: EssRequestType;
}

export type RequestsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; requests: EssRequestSummary[] }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export type DetailState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'ready'; request: EssRequestSummary }
  | { status: 'error'; message: string };

export interface UseRequests {
  state: RequestsState;
  detail: DetailState;
  filters: RequestFilters;
  setFilters: (filters: RequestFilters) => void;
  reload: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  cancel: (id: string, reason: string) => Promise<EssRequestSummary>;
  resubmit: (id: string, payload: AnySubmission, files?: EssFilePart[]) => Promise<EssRequestSummary>;
  /** New submissions for the non-leave types (leave has useLeave). */
  submit: (
    type: 'PERMISSION' | 'OVERTIME' | 'ATTENDANCE_CORRECTION',
    submission: PermissionSubmission | OvertimeSubmission | CorrectionSubmission,
    files?: EssFilePart[]
  ) => Promise<EssRequestSummary>;
  download: (requestId: string, attachmentId: string) => Promise<EssAttachmentFile>;
}

export function useRequests(initialFilters: RequestFilters = {}): UseRequests {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<RequestsState>({ status: 'idle' });
  const [detail, setDetail] = useState<DetailState>({ status: 'closed' });
  const [filters, setFilters] = useState<RequestFilters>(initialFilters);
  const [nonce, setNonce] = useState(0);

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  const ensureApi = useCallback(async (): Promise<EssRequestsApi> => createEssRequestsApi(bridge), [bridge]);

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
        const requests = await api.listRequests({ status: filters.status, type: filters.type, limit: 50 });
        if (!cancelled) setState({ status: 'ready', requests });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load requests.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureApi, filters, handleSessionExpired, nonce, session?.authSource]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const openDetail = useCallback(
    (id: string) => {
      setDetail({ status: 'loading' });
      void (async () => {
        try {
          const api = await ensureApi();
          const request = await api.getRequest(id);
          setDetail({ status: 'ready', request });
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

  const act = useCallback(
    async <T,>(action: (api: EssRequestsApi) => Promise<T>): Promise<T> => {
      const api = await ensureApi();
      try {
        const result = await action(api);
        reload();
        return result;
      } catch (err) {
        return rethrow(err);
      }
    },
    [ensureApi, reload, rethrow]
  );

  const cancel = useCallback(
    (id: string, reason: string) => act((api) => api.cancelRequest(id, reason)),
    [act]
  );

  const resubmit = useCallback(
    (id: string, payload: AnySubmission, files: EssFilePart[] = []) => act((api) => api.resubmitRequest(id, payload, files)),
    [act]
  );

  const submit = useCallback(
    (
      type: 'PERMISSION' | 'OVERTIME' | 'ATTENDANCE_CORRECTION',
      submission: PermissionSubmission | OvertimeSubmission | CorrectionSubmission,
      files: EssFilePart[] = []
    ) =>
      act((api) => {
        if (type === 'PERMISSION') return api.submitPermission(submission as PermissionSubmission, files);
        if (type === 'OVERTIME') return api.submitOvertime(submission as OvertimeSubmission, files);
        return api.submitCorrection(submission as CorrectionSubmission, files);
      }),
    [act]
  );

  const download = useCallback(
    (requestId: string, attachmentId: string) =>
      ensureApi().then((api) => api.downloadAttachment(requestId, attachmentId)),
    [ensureApi]
  );

  return { state, detail, filters, setFilters, reload, openDetail, closeDetail, cancel, resubmit, submit, download };
}
