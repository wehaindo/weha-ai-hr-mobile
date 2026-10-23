'use client';

// FR-606 delegation view (read-only): active inbound/outbound rules for the
// signed-in manager. Configuration lives in the tenant HR admin.

import { useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { createEssManagerApi, type ApprovalDelegationView } from '@/integration/ess/manager';
import { formatDelegationWindow } from '@/lib/ess/manager/view-model';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; delegations: ApprovalDelegationView[] }
  | { status: 'error'; message: string };

export function DelegationsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const bridge = useBridge();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const api = await createEssManagerApi(bridge);
        const delegations = await api.getDelegations();
        if (!cancelled) setState({ status: 'ready', delegations });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load delegations.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="delegations-dialog">
        <DialogHeader>
          <DialogTitle>Delegations</DialogTitle>
          <DialogDescription>
            Substitute approver rules affecting you — time-bounded and scope-limited. New rules are
            configured in the HR admin.
          </DialogDescription>
        </DialogHeader>

        {state.status === 'loading' && <Skeleton className="h-16 w-full" />}

        {state.status === 'error' && (
          <p className="text-sm text-destructive" data-testid="delegations-error">
            {state.message}
          </p>
        )}

        {state.status === 'ready' && state.delegations.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="delegations-empty">
            No active delegations.
          </p>
        )}

        {state.status === 'ready' &&
          state.delegations.map((delegation) => (
            <div key={delegation.id} className="rounded-md border px-3 py-2 text-sm" data-testid="delegation-row">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {delegation.counterpart.name}
                  {delegation.direction === 'INBOUND' ? ' → you' : ' → them'}
                </span>
                <Badge variant={delegation.isActive ? 'secondary' : 'outline'} data-testid="delegation-state">
                  {delegation.isActive ? 'Active' : 'Expired'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{formatDelegationWindow(delegation)}</p>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}
