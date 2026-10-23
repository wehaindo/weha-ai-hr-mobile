'use client';

// Manager dashboard (FR-601): counts + authorized team with today's
// attendance. Scope is server-computed from the token employee; projections
// are whitelisted (no personal/salary data — BRD §8).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toast';
import { EssApiError } from '@/integration/ess/core';
import {
  createEssManagerApi,
  type ManagerDashboard,
  type TeamMember,
  type TeamQuery,
} from '@/integration/ess/manager';

export type ManagerDashboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; dashboard: ManagerDashboard; team: TeamMember[]; nextCursor: string | null }
  | { status: 'no_session' }
  | { status: 'error'; error: EssApiError };

export interface UseManagerDashboard {
  state: ManagerDashboardState;
  search: string;
  setSearch: (search: string) => void;
  loadMore: () => void;
  reload: () => void;
}

export function useManagerDashboard(): UseManagerDashboard {
  const bridge = useBridge();
  const router = useRouter();
  const session = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<ManagerDashboardState>({ status: 'idle' });
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
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
    // keep current rows visible during an append (cursor) fetch
    setState((prev) => (cursor && prev.status === 'ready' ? prev : { status: 'loading' }));
    void (async () => {
      try {
        const api = await createEssManagerApi(bridge);
        const [dashboard, teamPage] = await Promise.all([
          api.getDashboard(),
          api.getTeam({ search: search || undefined, cursor } satisfies TeamQuery),
        ]);
        if (cancelled) return;
        setState((prev) => ({
          status: 'ready',
          dashboard: cursor && prev.status === 'ready' ? prev.dashboard : dashboard,
          team: cursor && prev.status === 'ready' ? [...prev.team, ...teamPage.team] : teamPage.team,
          nextCursor: teamPage.nextCursor,
        }));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EssApiError && err.isSessionExpired) {
          handleSessionExpired();
          return;
        }
        setState({
          status: 'error',
          error: err instanceof EssApiError ? err : new EssApiError('Failed to load the manager dashboard.', 0, 'unavailable'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, cursor, handleSessionExpired, nonce, search, session?.authSource]);

  const reload = useCallback(() => {
    setCursor(undefined);
    setNonce((n) => n + 1);
  }, []);

  const applySearch = useCallback((next: string) => {
    setSearch(next);
    setCursor(undefined);
    setNonce((n) => n + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || !state.nextCursor) return;
    setCursor(state.nextCursor);
  }, [state]);

  return { state, search, setSearch: applySearch, loadMore, reload };
}
