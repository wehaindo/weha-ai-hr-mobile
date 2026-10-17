'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { useAuthStore } from '@/stores/auth';
import { authenticate, fetchActiveUsers, type LoginUser } from '../actions';
import UserAvatar from './UserAvatar';
import PinInput from './PinInput';

export default function LoginScreen() {
  const bridge = useBridge();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const incrementAttempts = useAuthStore((s) => s.incrementAttempts);
  const isLocked = useAuthStore((s) => s.isLocked);

  const [users, setUsers] = useState<LoginUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lockSeconds, setLockSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchActiveUsers(bridge)
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const timer = setTimeout(() => setLockSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [lockSeconds]);

  const handlePinSubmit = useCallback(
    async (pin: string) => {
      if (!selected) return;
      setError(undefined);
      try {
        if (isLocked()) {
          setLockSeconds(Math.ceil(30));
          return;
        }
        const user = await authenticate(bridge, selected.id, pin);
        login(user);
        router.push('/dashboard');
      } catch (err) {
        incrementAttempts();
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    },
    [bridge, selected, login, incrementAttempts, isLocked, router]
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{deviceConfig.brand.sidebarTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Select your account to sign in</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No active users found. Seed the database or create a user in Settings.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4" data-testid="user-grid">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-muted"
                data-testid={`user-${user.display_name.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => {
                  setSelected(user);
                  setError(undefined);
                }}
              >
                <UserAvatar name={user.display_name} avatarColor={user.avatar_color} size="lg" />
                <span className="truncate text-sm font-medium">{user.display_name}</span>
                <span className="text-xs capitalize text-muted-foreground">{user.role}</span>
              </div>
            ))}
          </div>
        )}

        {lockSeconds > 0 && (
          <p className="mt-6 text-center text-sm text-destructive" data-testid="lockout-message">
            Too many attempts. Try again in {lockSeconds}s
          </p>
        )}
      </div>

      <PinInput
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        onSubmit={handlePinSubmit}
        userName={selected?.display_name ?? ''}
        error={error}
      />
    </div>
  );
}
