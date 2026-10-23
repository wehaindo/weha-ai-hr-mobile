'use client';

// Payslip detail for /payslips: fetch one published payslip + download the
// server-generated PDF artifact (contract §3.4).

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError } from '@/integration/ess/core';
import { createEssPayrollApi, type PayslipDetail } from '@/integration/ess/payroll';
import { saveBase64File } from '@/lib/ess/payroll/download';

export type PayslipDetailState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'ready'; payslip: PayslipDetail }
  | { status: 'error'; message: string };

export interface UsePayslip {
  detail: PayslipDetailState;
  open: (periodId: string) => void;
  close: () => void;
  /** Save the server PDF via a Blob download; surfaces document_generating. */
  downloadPdf: (periodId: string, fileName: string) => Promise<void>;
}

export function usePayslip(): UsePayslip {
  const bridge = useBridge();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [detail, setDetail] = useState<PayslipDetailState>({ status: 'closed' });

  const handleSessionExpired = useCallback(() => {
    toast.add({ title: 'Session expired', description: 'Please sign in again.', type: 'warning' });
    logout();
    router.replace('/');
  }, [logout, router]);

  const open = useCallback(
    (periodId: string) => {
      setDetail({ status: 'loading' });
      void (async () => {
        try {
          const api = await createEssPayrollApi(bridge);
          const payslip = await api.getPayslip(periodId);
          setDetail({ status: 'ready', payslip });
        } catch (err) {
          if (err instanceof EssApiError && err.isSessionExpired) {
            handleSessionExpired();
            return;
          }
          setDetail({ status: 'error', message: err instanceof Error ? err.message : 'Could not load the payslip.' });
        }
      })();
    },
    [bridge, handleSessionExpired]
  );

  const close = useCallback(() => setDetail({ status: 'closed' }), []);

  const downloadPdf = useCallback(
    async (periodId: string, fileName: string) => {
      try {
        const api = await createEssPayrollApi(bridge);
        const file = await api.downloadPayslipPdf(periodId);
        saveBase64File(file.file.base64, file.file.fileName || fileName, 'application/pdf');
        toast.add({ title: 'Payslip PDF saved', type: 'success' });
      } catch (err) {
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        if (err instanceof EssApiError && err.domainCode === 'document_generating') {
          toast.add({ title: 'PDF is still being generated', description: 'Try again shortly.', type: 'info' });
          return;
        }
        toast.add({ title: 'Download failed', description: err instanceof Error ? err.message : 'Please retry.', type: 'error' });
      }
    },
    [bridge, handleSessionExpired]
  );

  return { detail, open, close, downloadPdf };
}
