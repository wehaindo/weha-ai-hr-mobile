'use client';

// Bottom navigator shown instead of the sidebar on web/PWA (narrow) and
// Capacitor mobile. Primary tabs are the nav.config entries flagged
// `mobile: true` (plus `mobileIfPermitted` ones like Approvals for managers);
// the rest live under a "More" tab, and a Profile tab opens a bottom sheet
// (theme + sign out, replacing the desktop header controls). Rendered
// in-flow by AppShell so content never hides behind it.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUser, MoreHorizontal } from 'lucide-react';
import { navItemsForTarget } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import { useBridge } from '@/platform';
import { createEssRequestsApi } from '@/integration/ess/requests';
import { useSyncState } from './sync-indicator';
import { cn } from '@/lib/utils';

export default function BottomNav({
  onOpenProfile,
  onOpenMore,
}: {
  onOpenProfile: () => void;
  onOpenMore: () => void;
}) {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);
  const bridge = useBridge();

  const permitted = navItemsForTarget().filter((item) => !item.permission || can(item.permission));
  const items = permitted.filter((item) => item.mobile || item.mobileIfPermitted);
  const moreItems = permitted.filter((item) => !item.mobile && !item.mobileIfPermitted);
  const moreActive = moreItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  const syncState = useSyncState();

  // Pending-approval badge for managers — best-effort, refreshed on navigation
  // so a decision on /approvals clears the count on the way back. The inbox is
  // cursor-paginated, so drain pages (cap 5) until the badge maxes out at 9+.
  const canApprove = can('ess.approve');
  const [pendingApprovals, setPendingApprovals] = useState(0);
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
        if (!cancelled) setPendingApprovals(total);
      } catch {
        if (!cancelled) setPendingApprovals(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, canApprove, pathname]);

  return (
    <nav
      className="flex shrink-0 justify-around border-t bg-background pb-[env(safe-area-inset-bottom)]"
      data-testid="bottom-nav"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isSync = item.href === '/sync';
        // Center of the bar: Requests gets a raised circular (FAB-style) tab.
        const isCenter = item.href === '/requests';
        if (isCenter) {
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href}`}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <span
                data-testid="bottom-nav-circle"
                className="flex size-14 -translate-y-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              >
                <item.icon className="size-7 shrink-0" />
              </span>
            </Link>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`nav-${item.href}`}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <span className="relative">
              <item.icon className="size-5 shrink-0" />
              {item.href === '/approvals' && pendingApprovals > 0 && (
                <span
                  data-testid="approvals-badge"
                  className="absolute -top-1.5 -right-2 flex min-w-4 justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
                >
                  {pendingApprovals > 9 ? '9+' : pendingApprovals}
                </span>
              )}
              {isSync && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-1 size-2 rounded-full bg-current',
                    syncState.className.replace('animate-spin', '').trim()
                  )}
                  title={syncState.label}
                  aria-label={syncState.label}
                />
              )}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      {moreItems.length > 0 && (
        <button
          type="button"
          onClick={onOpenMore}
          data-testid="more-tab"
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
            moreActive ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <MoreHorizontal className="size-5 shrink-0" />
          <span className="truncate">More</span>
        </button>
      )}

      <button
        type="button"
        onClick={onOpenProfile}
        data-testid="profile-tab"
        className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
      >
        <CircleUser className="size-5 shrink-0" />
        <span className="truncate">Profile</span>
      </button>
    </nav>
  );
}
