'use client';

import Link from 'next/link';
import { CloudOffIcon, RefreshCwIcon, CloudCogIcon, CloudCheckIcon } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSyncStore } from '@/sync/sync-store';
import { cn } from '@/lib/utils';

export default function SyncIndicator() {
  const { isOnline } = useOnlineStatus();
  const running = useSyncStore((s) => s.running);
  const erpReachable = useSyncStore((s) => s.erpReachable);
  const pending = useSyncStore((s) => s.stats.pending + s.stats.failed);

  const state = !isOnline
    ? { icon: CloudOffIcon, className: 'text-destructive', label: 'Offline' }
    : running
      ? { icon: RefreshCwIcon, className: 'text-primary animate-spin', label: 'Syncing' }
      : erpReachable === false || pending > 0
        ? { icon: CloudCogIcon, className: 'text-amber-500', label: `${pending} queued` }
        : { icon: CloudCheckIcon, className: 'text-emerald-500', label: 'Synced' };

  const Icon = state.icon;

  return (
    <Link
      href="/sync"
      data-testid="sync-indicator"
      title={state.label}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-muted',
        state.className
      )}
    >
      <Icon className="size-4" />
      <span className="hidden sm:inline">{state.label}</span>
    </Link>
  );
}
