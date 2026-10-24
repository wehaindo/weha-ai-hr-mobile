'use client';

// Bottom navigator shown instead of the sidebar on web/PWA (narrow) and
// Capacitor mobile. Same items + permission/module filtering as the sidebar,
// plus a Profile entry that opens a bottom sheet (theme + sign out, replacing
// the desktop header controls). Rendered in-flow by AppShell so content never
// hides behind it.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUser } from 'lucide-react';
import { navItemsForTarget } from '@/app/nav.config';
import { useAuthStore } from '@/stores/auth';
import { useSyncState } from './sync-indicator';
import { cn } from '@/lib/utils';

export default function BottomNav({ onOpenProfile }: { onOpenProfile: () => void }) {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);

  const items = navItemsForTarget().filter((item) => !item.permission || can(item.permission));
  const syncState = useSyncState();

  return (
    <nav
      className="flex shrink-0 justify-around border-t bg-background pb-[env(safe-area-inset-bottom)]"
      data-testid="bottom-nav"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isSync = item.href === '/sync';
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
