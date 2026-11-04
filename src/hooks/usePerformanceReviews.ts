'use client';

// My performance reviews: list + detail with the two self-service writes —
// submit the SELF assessment (only while the review is SELF_ASSESSMENT) and
// acknowledge a FINALIZED review (publishing its summary).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError } from '@/integration/ess/core';
import {
  createEssPerformanceApi,
  type EssPerformanceApi,
  type PerformanceReview,
  type SelfAssessmentInput,
} from '@/integration/ess/performance';

export type ReviewListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; reviews: PerformanceReview[] }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export type ReviewDetailState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'ready'; review: PerformanceReview }
  | { status: 'error'; message: string };

export interface UsePerformanceReviews {
  list: ReviewListState;
  detail: ReviewDetailState;
  acting: boolean;
  actError: string | null;
  reload: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  submitSelfAssessment: (id: string, input: SelfAssessmentInput) => Promise<PerformanceReview>;
  acknowledge: (id: string) => Promise<PerformanceReview>;
}

export function usePerformanceReviews(): UsePerformanceReviews {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const apiRef = useRef<EssPerformanceApi | null>(null);
  const [list, setList] = useState<ReviewListState>({ status: 'idle' });
  const [detail, setDetail] = useState<ReviewDetailState>({ status: 'closed' });
  const [acting, setActing] = useState(false);
  const [actError, setActError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  const ensureApi = useCallback(async (): Promise<EssPerformanceApi> => {
    if (!apiRef.current) apiRef.current = await createEssPerformanceApi(bridge);
    return apiRef.current;
  }, [bridge]);

  useEffect(() => {
    if (session?.authSource !== 'mobile') {
      setList({ status: 'no_session' });
      return;
    }
    let cancelled = false;
    setList({ status: 'loading' });
    void (async () => {
      try {
        const api = await ensureApi();
        const reviews = await api.listReviews();
        if (!cancelled) setList({ status: 'ready', reviews });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setList({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load reviews.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureApi, handleSessionExpired, nonce, session?.authSource]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const openDetail = useCallback(
    (id: string) => {
      setDetail({ status: 'loading' });
      setActError(null);
      void (async () => {
        try {
          const api = await ensureApi();
          const review = await api.getReview(id);
          setDetail({ status: 'ready', review });
        } catch (err) {
          if (err instanceof EssApiError && err.isSessionExpired) {
            handleSessionExpired();
            return;
          }
          setDetail({ status: 'error', message: err instanceof Error ? err.message : 'Could not load the review.' });
        }
      })();
    },
    [ensureApi, handleSessionExpired]
  );

  const closeDetail = useCallback(() => setDetail({ status: 'closed' }), []);

  const runAction = useCallback(
    async (action: (api: EssPerformanceApi) => Promise<PerformanceReview>): Promise<PerformanceReview> => {
      setActing(true);
      setActError(null);
      try {
        const api = await ensureApi();
        const review = await action(api);
        setDetail({ status: 'ready', review });
        setNonce((n) => n + 1); // list + summary reflect the new state
        return review;
      } catch (err) {
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
        }
        setActError(err instanceof Error ? err.message : 'The action failed.');
        throw err;
      } finally {
        setActing(false);
      }
    },
    [ensureApi, handleSessionExpired]
  );

  const submitSelfAssessment = useCallback(
    (id: string, input: SelfAssessmentInput) => runAction((api) => api.submitSelfAssessment(id, input)),
    [runAction]
  );

  const acknowledge = useCallback((id: string) => runAction((api) => api.acknowledge(id)), [runAction]);

  return { list, detail, acting, actError, reload, openDetail, closeDetail, submitSelfAssessment, acknowledge };
}
