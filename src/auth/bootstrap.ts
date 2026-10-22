'use client';

import { useEffect } from 'react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { fetchPermissions } from './actions';

/**
 * Refreshes the session user's permissions from the database on boot, so role
 * changes made elsewhere apply without re-login.
 */
export function useAuthBootstrap(): void {
  const bridge = useBridge();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setPermissions = useAuthStore((s) => s.setPermissions);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let cancelled = false;
    fetchPermissions(bridge, user.role)
      .then((permissions) => {
        if (!cancelled) setPermissions(permissions);
      })
      .catch(() => {
        /* offline or db issue — keep cached permissions */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh only when identity/role change
  }, [bridge, isAuthenticated, user?.id, user?.role, setPermissions]);
}
