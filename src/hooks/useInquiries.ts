'use client';

// Payroll inquiries (BRD §4.6): list, detail thread, submit (multipart with
// attachments), and employee replies while the inquiry is open.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError, type EssFilePart } from '@/integration/ess/core';
import {
  createEssPayrollApi,
  type EssPayrollApi,
  type InquirySubmission,
  type PayrollInquiry,
} from '@/integration/ess/payroll';

export type InquiriesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; inquiries: PayrollInquiry[] }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export type InquiryDetailState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'ready'; inquiry: PayrollInquiry }
  | { status: 'error'; message: string };

export interface UseInquiries {
  state: InquiriesState;
  detail: InquiryDetailState;
  reload: () => void;
  openDetail: (inquiryId: string) => void;
  closeDetail: () => void;
  submit: (submission: InquirySubmission, files?: EssFilePart[]) => Promise<PayrollInquiry>;
  reply: (inquiryId: string, message: string) => Promise<PayrollInquiry>;
}

export function useInquiries(): UseInquiries {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<InquiriesState>({ status: 'idle' });
  const [detail, setDetail] = useState<InquiryDetailState>({ status: 'closed' });
  const [nonce, setNonce] = useState(0);

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  const ensureApi = useCallback(async (): Promise<EssPayrollApi> => createEssPayrollApi(bridge), [bridge]);

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
        const inquiries = await api.listInquiries();
        if (!cancelled) setState({ status: 'ready', inquiries });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load inquiries.', 0, 'unavailable'),
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
    (inquiryId: string) => {
      setDetail({ status: 'loading' });
      void (async () => {
        try {
          const api = await ensureApi();
          const inquiry = await api.getInquiry(inquiryId);
          setDetail({ status: 'ready', inquiry });
        } catch (err) {
          if (err instanceof EssApiError && err.isSessionExpired) {
            handleSessionExpired();
            return;
          }
          setDetail({ status: 'error', message: err instanceof Error ? err.message : 'Could not load the inquiry.' });
        }
      })();
    },
    [ensureApi, handleSessionExpired]
  );

  const closeDetail = useCallback(() => setDetail({ status: 'closed' }), []);

  const submit = useCallback(
    async (submission: InquirySubmission, files: EssFilePart[] = []): Promise<PayrollInquiry> => {
      const api = await ensureApi();
      try {
        const inquiry = await api.submitInquiry(submission, files);
        setNonce((n) => n + 1);
        return inquiry;
      } catch (err) {
        return rethrow(err);
      }
    },
    [ensureApi, rethrow]
  );

  const reply = useCallback(
    async (inquiryId: string, message: string): Promise<PayrollInquiry> => {
      const api = await ensureApi();
      try {
        const inquiry = await api.postInquiryMessage(inquiryId, message);
        setDetail({ status: 'ready', inquiry }); // thread updates in place
        setNonce((n) => n + 1); // list status may have moved on
        return inquiry;
      } catch (err) {
        return rethrow(err);
      }
    },
    [ensureApi, rethrow]
  );

  return { state, detail, reload, openDetail, closeDetail, submit, reply };
}
