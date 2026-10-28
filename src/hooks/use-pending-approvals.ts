'use client';

// Pending-approval count for the manager chip — best-effort, refreshed on
// navigation so a decision on /approvals clears it on the way back. The inbox
// is cursor-paginated: drain pages (cap 5) until the count maxes out at 10.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useBridge } from '@/platform';
import { createEssRequestsApi } from '@/integration/ess/requests';

export function usePendingApprovals(): number {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);
  const bridge = useBridge();
  const canApprove = can('ess.approve');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canApprove) return;
    let cancelled = false;
    void (async () => {
      try {
        const api = await createEssRequestsApi(bridge);
        let cursor: string | undefined;
        let total = 0;
        for (let page = 0; page < 5; page += 1) {
          const result = await api.getInbox({}, cursor);
          total += result.items.length;
          if (!result.nextCursor || total > 9) break;
          cursor = result.nextCursor;
        }
        if (!cancelled) setCount(total);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, canApprove, pathname]);

  return count;
}
