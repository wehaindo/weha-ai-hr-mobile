'use client';

// Self-contained notification bell: shows the unread count and opens the
// notifications inbox. Used in both the mobile title row and the desktop
// header so the inbox is reachable wherever push can arrive.

import { useState } from 'react';
import { BellIcon } from 'lucide-react';
import { useNotifications, unreadNotificationCount } from '@/stores/notifications';
import NotificationsSheet from './notifications-sheet';

export default function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const items = useNotifications((s) => s.items);
  const unread = unreadNotificationCount(items);

  return (
    <>
      <button
        type="button"
        data-testid="notifications-button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span
            data-testid="notifications-badge"
            className="absolute -top-0.5 -right-0.5 flex min-w-4 justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <NotificationsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
