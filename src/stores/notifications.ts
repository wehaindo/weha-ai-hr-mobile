'use client';

// In-app notification log fed by foreground FCM messages (and future
// in-app sources). Session-only: pushes are re-delivered by the OS tray /
// notification centre, so persistence is deliberately out of scope.
// Ported from weha-ai-hrd-mobile.

import { create } from 'zustand';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  read: boolean;
}

const MAX_ITEMS = 50;

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface NotificationsState {
  items: AppNotification[];
  /** Insert a newly received notification (newest first, capped). */
  add(notification: { title?: string; body?: string }): void;
  markAllRead(): void;
}

export const useNotifications = create<NotificationsState>((set) => ({
  items: [],
  add({ title, body }) {
    set((state) => ({
      items: [
        {
          id: makeId(),
          title: title?.trim() || 'Notification',
          body: body?.trim() ?? '',
          receivedAt: new Date().toISOString(),
          read: false,
        },
        ...state.items,
      ].slice(0, MAX_ITEMS),
    }));
  },
  markAllRead() {
    set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) }));
  },
}));

/** Unread notification count (0 when the bell should show no badge). */
export function unreadNotificationCount(items: AppNotification[]): number {
  return items.filter((item) => !item.read).length;
}
