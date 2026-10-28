'use client';

// Notifications sheet opened from the bell on the bottom-nav layout title
// row: recent foreground FCM messages, unread highlighted, mark-all-read.
// Honest empty state — push is opt-in (Settings → Push (FCM)).

import { BellOffIcon, CheckCheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useNotifications } from '@/stores/notifications';

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const items = useNotifications((s) => s.items);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const hasUnread = items.some((item) => !item.read);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="notifications-sheet">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground" data-testid="notifications-empty">
            No notifications yet. Push messages appear here while the app is
            open — enable push in Settings → Push (FCM).
          </p>
        ) : (
          <>
            <nav className="max-h-[50vh] grid gap-1 overflow-y-auto px-4 pb-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  data-testid="notification-row"
                  data-read={item.read ? 'true' : 'false'}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    item.read ? 'opacity-70' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(item.receivedAt)}
                    </span>
                  </div>
                  {item.body && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                  )}
                </div>
              ))}
            </nav>
            <div className="px-4 pb-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!hasUnread}
                onClick={markAllRead}
                data-testid="notifications-mark-read"
              >
                <CheckCheckIcon className="size-4 mr-2" aria-hidden />
                Mark all read
              </Button>
            </div>
          </>
        )}

        {items.length === 0 && (
          <div className="flex justify-center pb-4 text-muted-foreground/50" aria-hidden>
            <BellOffIcon className="size-8" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
