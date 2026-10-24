'use client';

// Shared sign-out flow: revokes a mobile (WEHA-account) refresh token best-effort,
// clears the local session, then returns to the login screen. Reused by the
// desktop header's UserMenu and the mobile Profile sheet.

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useBridge } from '@/platform';
import { clearMobileSession, loadMobileSession } from '@/auth/mobile-session';
import { createMobileAuthClient } from '@/integration/mobile-auth/client';

export function useLogout(): { handleLogout: () => Promise<void> } {
  const router = useRouter();
  const bridge = useBridge();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = useCallback(async (): Promise<void> => {
    const user = useAuthStore.getState().user;
    if (user?.authSource === 'mobile') {
      try {
        const session = await loadMobileSession(bridge);
        if (session) {
          const client = await createMobileAuthClient(bridge);
          // Revocation is idempotent server-side; ignore failures (offline).
          await client.logout(session.refresh_token).catch(() => undefined);
        }
        await clearMobileSession(bridge);
      } catch {
        /* best effort — local logout proceeds regardless */
      }
    }
    logout();
    router.replace('/');
  }, [bridge, logout, router]);

  return { handleLogout };
}
