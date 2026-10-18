'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionUser {
  id: string;
  display_name: string;
  role: string;
  avatar_color?: string;
  permissions: string[];
}

interface AuthStore {
  user: SessionUser | null;
  isAuthenticated: boolean;
  loginAttempts: number;
  lockedUntil: number | null;
  /** Configurable lockout policy (driven by security settings; defaults below). */
  maxAttempts: number;
  lockoutMs: number;

  login: (user: SessionUser) => void;
  logout: () => void;
  setPermissions: (permissions: string[]) => void;
  configureLockout: (maxAttempts: number, lockoutMs: number) => void;
  incrementAttempts: () => void;
  resetAttempts: () => void;
  isLocked: () => boolean;
  can: (permission: string) => boolean;
}

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 30000;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      loginAttempts: 0,
      lockedUntil: null,
      maxAttempts: MAX_LOGIN_ATTEMPTS,
      lockoutMs: LOCKOUT_MS,

      login: (user) => {
        set({
          user,
          isAuthenticated: true,
          loginAttempts: 0,
          lockedUntil: null,
        });
      },

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
        });
      },

      setPermissions: (permissions) => {
        const { user } = get();
        if (!user) return;
        set({ user: { ...user, permissions } });
      },

      configureLockout: (maxAttempts, lockoutMs) => {
        set({ maxAttempts: Math.max(1, maxAttempts), lockoutMs: Math.max(1000, lockoutMs) });
      },

      incrementAttempts: () => {
        const { loginAttempts, maxAttempts, lockoutMs } = get();
        const newAttempts = loginAttempts + 1;
        if (newAttempts >= maxAttempts) {
          set({
            loginAttempts: newAttempts,
            lockedUntil: Date.now() + lockoutMs,
          });
        } else {
          set({ loginAttempts: newAttempts });
        }
      },

      resetAttempts: () => {
        set({ loginAttempts: 0, lockedUntil: null });
      },

      isLocked: () => {
        const { lockedUntil } = get();
        if (!lockedUntil) return false;
        if (Date.now() > lockedUntil) {
          set({ lockedUntil: null, loginAttempts: 0 });
          return false;
        }
        return true;
      },

      can: (permission) => {
        const { user } = get();
        if (!user) return false;
        return user.permissions.includes(permission);
      },
    }),
    {
      name: 'device-auth',
    }
  )
);
