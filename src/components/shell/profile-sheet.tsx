'use client';

// Bottom sheet opened from the Profile tab on bottom-nav layouts. Replaces the
// desktop header's user menu: shows identity, theme toggle and sign out.

import { LogOutIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import UserAvatar from '@/auth/components/UserAvatar';
import ThemeToggle from './theme-toggle';
import { useLogout } from '@/hooks/use-logout';

export default function ProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useAuthStore((s) => s.user);
  const { handleLogout } = useLogout();

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
