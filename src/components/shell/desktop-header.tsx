'use client';

import { useRouter } from 'next/navigation';
import { LogOutIcon } from 'lucide-react';
import { useAuthStore, type SessionUser } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UserAvatar from '@/auth/components/UserAvatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import ThemeToggle from './theme-toggle';
import DisplayToggles from './display-toggles';
import WindowControls from './window-controls';
import SyncIndicator from './sync-indicator';

function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-2" data-testid="user-menu" />}>
        <UserAvatar name={user.display_name} avatarColor={user.avatar_color} size="sm" />
        <span className="hidden max-w-24 truncate text-sm sm:inline">{user.display_name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="capitalize">{user.role}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="logout"
          onClick={() => {
            logout();
            router.replace('/');
          }}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DesktopHeader({ title }: { title?: string }) {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold" data-testid="page-title">
          {title ?? ''}
        </h1>
      </div>
      <SyncIndicator />
      <ThemeToggle />
      <DisplayToggles />
      {user && <UserMenu user={user} />}
      <WindowControls />
    </header>
  );
}
