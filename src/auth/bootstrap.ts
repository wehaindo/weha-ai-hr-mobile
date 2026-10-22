'use client';

import { useEffect } from 'react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { fetchPermissions } from './actions';
import { ensureFreshAccessToken } from './mobile-session';
import { createMobileAuthClient } from '@/integration/mobile-auth/client';

/**
 * On boot: refresh the local user's permissions from the database (so role
 * changes apply without re-login), or — for a mobile (WEHA-account) session —
 * rotate the access token. Mobile permissions are fixed at login, so they are
 * not re-read. A revoked refresh token logs the user out; an unreachable
 * framework keeps the session (offline-tolerant).
 */
export function useAuthBootstrap(): void {
  const bridge = useBridge();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let cancelled = false;

    if (user.authSource === 'mobile') {
      void (async () => {
        try {
          const client = await createMobileAuthClient(bridge);
          const result = await ensureFreshAccessToken(bridge, client);
          if (!cancelled && result === 'unauthorized') logout();
        } catch {
          /* offline or db issue — keep the session */
        }
      })();
      return () => {
        cancelled = true;
      };
    }

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
  }, [bridge, isAuthenticated, user?.id, user?.role, user?.authSource, setPermissions, logout]);
}
