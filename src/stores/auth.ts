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

  login: (user: SessionUser) => void;
  logout: () => void;
  setPermissions: (permissions: string[]) => void;
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

      incrementAttempts: () => {
        const { loginAttempts } = get();
        const newAttempts = loginAttempts + 1;
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          set({
            loginAttempts: newAttempts,
            lockedUntil: Date.now() + LOCKOUT_MS,
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
