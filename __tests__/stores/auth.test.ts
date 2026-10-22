import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, LOCKOUT_MS, MAX_LOGIN_ATTEMPTS } from '@/stores/auth';

const adminSession = {
  id: 'u1',
  display_name: 'Administrator',
  role: 'admin',
  permissions: ['app.use', 'users.manage'],
};

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, loginAttempts: 0, lockedUntil: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('logs in and out', () => {
    useAuthStore.getState().login(adminSession);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.display_name).toBe('Administrator');

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('can() reflects permissions', () => {
    useAuthStore.getState().login(adminSession);
    expect(useAuthStore.getState().can('users.manage')).toBe(true);
    expect(useAuthStore.getState().can('sync.manage')).toBe(false);
  });

  it('can() is false without a session', () => {
    expect(useAuthStore.getState().can('app.use')).toBe(false);
  });

  it('locks after 5 failed attempts', () => {
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      useAuthStore.getState().incrementAttempts();
    }
    expect(useAuthStore.getState().isLocked()).toBe(true);
  });

  it('lock expires after the lockout window', () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      useAuthStore.getState().incrementAttempts();
    }
    expect(useAuthStore.getState().isLocked()).toBe(true);

    vi.advanceTimersByTime(LOCKOUT_MS + 1);
    expect(useAuthStore.getState().isLocked()).toBe(false);
    expect(useAuthStore.getState().loginAttempts).toBe(0);
    vi.useRealTimers();
  });

  it('setPermissions updates the session user', () => {
    useAuthStore.getState().login(adminSession);
    useAuthStore.getState().setPermissions(['app.use']);
    expect(useAuthStore.getState().can('users.manage')).toBe(false);
    expect(useAuthStore.getState().can('app.use')).toBe(true);
  });
});
