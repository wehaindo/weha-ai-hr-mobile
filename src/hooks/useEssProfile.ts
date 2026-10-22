'use client';

// Shared profile loader for dashboard + profile page.
// In-memory only: employee records are never persisted to SQLite/localStorage
// (BRD §4.4 — no confidential offline caching). Session expiry triggers the
// configured reauthentication (toast + logout + redirect).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { createEssApiClient, EssApiError, type EssEmployee } from '@/integration/ess/client';

export type EssProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; employee: EssEmployee }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export interface UseEssProfile {
  state: EssProfileState;
  reload: () => void;
  /** Apply an allowlisted patch; returns the updated employee or throws. */
  update: (patch: { email?: string; phone?: string }) => Promise<EssEmployee>;
}

export function useEssProfile(): UseEssProfile {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<EssProfileState>({ status: 'idle' });
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
        const client = await createEssApiClient(bridge);
        const employee = await client.getProfile();
        if (!cancelled) setState({ status: 'ready', employee });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          setState({ status: 'error', error: err });
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error:
            err instanceof EssApiError
              ? err
              : new EssApiError('Failed to load the profile.', 0, 'unavailable'),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bridge, session?.authSource, nonce, handleSessionExpired]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const update = useCallback(
    async (patch: { email?: string; phone?: string }) => {
      const client = await createEssApiClient(bridge);
      try {
        const employee = await client.updateProfile(patch);
        setState({ status: 'ready', employee });
        return employee;
      } catch (err) {
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
        }
        throw err;
      }
    },
    [bridge, handleSessionExpired]
  );

  return { state, reload, update };
}
