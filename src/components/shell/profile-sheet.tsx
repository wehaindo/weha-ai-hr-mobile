'use client';

// Bottom sheet opened from the Profile tab on bottom-nav layouts. Replaces the
// desktop header's user menu: shows identity, theme toggle, a quick FCM enable
// (so any role can turn push on without Settings) and sign out.

import { useCallback, useEffect, useState } from 'react';
import { LogOutIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import UserAvatar from '@/auth/components/UserAvatar';
import ThemeToggle from './theme-toggle';
import { useLogout } from '@/hooks/use-logout';
import { getStatus, startPush, stopPush, type PushStatus } from '@/integration/push';

export default function ProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const bridge = useBridge();
  const user = useAuthStore((s) => s.user);
  const { handleLogout } = useLogout();

  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPush = useCallback(async () => {
    setPushStatus(await getStatus(bridge));
  }, [bridge]);

  useEffect(() => {
    if (open && deviceConfig.modules.push) void refreshPush();
  }, [open, refreshPush]);

  const togglePush = useCallback(
    async (enabled: boolean) => {
      setPushBusy(true);
      try {
        if (enabled) {
          const next = await startPush(bridge);
          setPushStatus(next);
          if (next.supported && next.token) toast.add({ title: 'Push enabled', type: 'success' });
          else if (!next.supported) toast.add({ title: 'Push not supported on this platform', type: 'info' });
          else toast.add({ title: 'Push enabled — permission not granted or no token yet', type: 'info' });
        } else {
          stopPush();
          await bridge.kv.set('push.enabled', false);
          await refreshPush();
          toast.add({ title: 'Push disabled', type: 'success' });
        }
      } catch (err) {
        toast.add({ title: err instanceof Error ? err.message : 'Failed to update push', type: 'error' });
        await refreshPush();
      } finally {
        setPushBusy(false);
      }
    },
    [bridge, refreshPush]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="profile-sheet">
        <SheetHeader>
          <SheetTitle>Profile</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-3 px-4 pb-2">
          {user && (
            <>
              <UserAvatar name={user.display_name} avatarColor={user.avatar_color} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" data-testid="profile-name">
                  {user.display_name}
                </p>
                <p className="truncate text-xs capitalize text-muted-foreground">{user.role}</p>
              </div>
            </>
          )}
          <ThemeToggle />
        </div>

        {deviceConfig.modules.push && (
          <div className="flex items-center justify-between gap-3 border-y px-4 py-3" data-testid="profile-push">
            <div className="min-w-0">
              <p className="text-sm font-medium">Push notifications</p>
              <p className="text-xs text-muted-foreground" data-testid="profile-push-status">
                {pushStatus?.permission === 'granted'
                  ? 'Allowed — receive FCM while the app is open'
                  : pushStatus?.permission === 'denied'
                    ? 'Blocked — allow notifications in device settings'
                    : 'Receive FCM push while the app is open'}
              </p>
            </div>
            <Switch
              checked={pushStatus?.enabled ?? false}
              disabled={pushBusy}
              onCheckedChange={(checked) => void togglePush(checked)}
              data-testid="profile-push-toggle"
            />
          </div>
        )}

        <div className="px-4 pb-4">
          <Button
            variant="outline"
            className="w-full"
            data-testid="profile-logout"
            onClick={() => {
              void handleLogout();
            }}
          >
            <LogOutIcon className="size-4 mr-2" />
            Sign out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
