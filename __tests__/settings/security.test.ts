// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth';

describe('auth lockout policy (driven by security settings)', () => {
  beforeEach(() => {
    // Reset to a clean, unlocked state.
    useAuthStore.setState({ loginAttempts: 0, lockedUntil: null, maxAttempts: 5, lockoutMs: 30000 });
  });

  it('locks after the default max attempts', () => {
    const store = useAuthStore.getState();
    for (let i = 0; i < 5; i++) store.incrementAttempts();
    expect(useAuthStore.getState().isLocked()).toBe(true);
  });

  it('respects a configured max attempts (configureLockout)', () => {
    useAuthStore.getState().configureLockout(2, 30000);
    useAuthStore.getState().incrementAttempts();
    expect(useAuthStore.getState().isLocked()).toBe(false);
    useAuthStore.getState().incrementAttempts();
    expect(useAuthStore.getState().isLocked()).toBe(true);
  });

  it('clamps configured max attempts to >= 1', () => {
    useAuthStore.getState().configureLockout(0, 30000);
    expect(useAuthStore.getState().maxAttempts).toBe(1);
  });

  it('resetAttempts clears the lock', () => {
    const store = useAuthStore.getState();
    for (let i = 0; i < 5; i++) store.incrementAttempts();
    expect(useAuthStore.getState().isLocked()).toBe(true);
    useAuthStore.getState().resetAttempts();
    expect(useAuthStore.getState().isLocked()).toBe(false);
    expect(useAuthStore.getState().loginAttempts).toBe(0);
  });

  it('isLocked auto-clears once the lockout window elapses', () => {
    // Set an already-elapsed lockout window directly (avoids timing flake).
    useAuthStore.setState({ lockedUntil: Date.now() - 10 });
    expect(useAuthStore.getState().isLocked()).toBe(false);
    // The stale window + attempts are cleared.
    expect(useAuthStore.getState().lockedUntil).toBeNull();
    expect(useAuthStore.getState().loginAttempts).toBe(0);
  });
});
