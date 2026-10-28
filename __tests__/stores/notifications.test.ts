import { beforeEach, describe, expect, it } from 'vitest';
import { useNotifications, unreadNotificationCount } from '@/stores/notifications';

describe('notifications store', () => {
  beforeEach(() => {
    useNotifications.setState({ items: [] });
  });

  it('adds notifications newest-first with sensible defaults', () => {
    const { add } = useNotifications.getState();
    add({ title: 'First', body: 'a' });
    add({ title: 'Second', body: 'b' });

    const items = useNotifications.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Second');
    expect(items[0].read).toBe(false);
    expect(Number.isNaN(Date.parse(items[0].receivedAt))).toBe(false);
  });

  it('falls back to "Notification" when the push carries no title', () => {
    useNotifications.getState().add({});
    expect(useNotifications.getState().items[0].title).toBe('Notification');
  });

  it('caps the log at 50 items', () => {
    const { add } = useNotifications.getState();
    for (let i = 0; i < 60; i += 1) add({ title: `n${i}` });
    expect(useNotifications.getState().items).toHaveLength(50);
    expect(useNotifications.getState().items[0].title).toBe('n59');
  });

  it('markAllRead clears the unread count without dropping items', () => {
    const { add, markAllRead } = useNotifications.getState();
    add({ title: 'a' });
    add({ title: 'b' });
    expect(unreadNotificationCount(useNotifications.getState().items)).toBe(2);

    markAllRead();
    expect(unreadNotificationCount(useNotifications.getState().items)).toBe(0);
    expect(useNotifications.getState().items).toHaveLength(2);
  });
});
