'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBridge } from '@/platform';
import deviceConfig from '@/device.config';
import { useAuthStore } from '@/stores/auth';
import { authenticate, authenticateWithCredentials, authenticateWithMobile, authenticateWithMobileOtp, fetchActiveUsers, requestMobileLoginCode, type LoginUser } from '../actions';
import { MobileAuthError } from '@/integration/mobile-auth/client';
import { getMobileTenantSlug, setMobileTenantSlug } from '../mobile-session';
import { toast } from '@/components/ui/toast';
import UserAvatar from './UserAvatar';
import PinInput from './PinInput';
import PasswordLogin from './PasswordLogin';
import MobileLogin, { type MobileLoginView } from './MobileLogin';
import TenantSetup from './TenantSetup';

export default function LoginScreen() {
  const bridge = useBridge();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const incrementAttempts = useAuthStore((s) => s.incrementAttempts);
  const isLocked = useAuthStore((s) => s.isLocked);

  const [users, setUsers] = useState<LoginUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LoginUser | null>(null);
  // Build-time enabled types (NEXT_PUBLIC_LOGIN_METHOD). The user SWITCHES
  // between them on this page (HRD-mobile style toggle links).
  const enabled = deviceConfig.loginMethods;
  const [mode, setMode] = useState<'pin' | 'password' | 'mobile'>(
    enabled.includes('pin') ? 'pin' : enabled[0]
  );
  // Toggle links to every other enabled type (pin is reached via Back when enabled).
  const otherMethods = enabled.filter((m) => m !== mode && m !== 'pin') as Array<'password' | 'mobile'>;
  // Back returns to the pin grid — only when pin is actually enabled (never a dead end).
  const showBack = enabled.includes('pin') && mode !== 'pin';
  const [mobileView, setMobileView] = useState<MobileLoginView>('password');
  const [defaultTenantSlug, setDefaultTenantSlug] = useState('');
  // Distinguishes "no slug saved (show first-run setup)" from "still loading".
  const [tenantSlugLoaded, setTenantSlugLoaded] = useState(false);
  const [tenantBusy, setTenantBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [mobileBusy, setMobileBusy] = useState(false);
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

  // Load the tenant slug remembered from the last successful mobile sign-in so
  // the field is prefilled (type once; edit only to switch tenants). Also used
  // to decide whether the first-run tenant setup is needed.
  useEffect(() => {
    let cancelled = false;
    void getMobileTenantSlug(bridge)
      .then((slug) => {
        if (!cancelled) setDefaultTenantSlug(slug);
      })
      .catch(() => {
        /* no remembered slug — field stays empty */
      })
      .finally(() => {
        if (!cancelled) setTenantSlugLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // First-run: persist the tenant slug, then flip to the login form (prefilled).
  const handleTenantSetup = useCallback(
    async (slug: string) => {
      setError(undefined);
      setTenantBusy(true);
      try {
        await setMobileTenantSlug(bridge, slug);
        setDefaultTenantSlug(slug);
        toast.add({ title: 'Tenant saved', description: slug, type: 'success' });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the tenant');
      } finally {
        setTenantBusy(false);
      }
    },
    [bridge]
  );

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

  const handlePasswordSubmit = useCallback(
    async (username: string, password: string) => {
      setError(undefined);
      try {
        if (isLocked()) {
          setLockSeconds(Math.ceil(30));
          return;
        }
        setPwBusy(true);
        const user = await authenticateWithCredentials(bridge, username, password);
        login(user);
        router.push('/dashboard');
      } catch (err) {
        incrementAttempts();
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setPwBusy(false);
      }
    },
    [bridge, login, incrementAttempts, isLocked, router]
  );

  const handleMobileSubmit = useCallback(
    async (email: string, password: string, tenantSlug?: string) => {
      setError(undefined);
      try {
        if (isLocked()) {
          setLockSeconds(Math.ceil(30));
          return;
        }
        setMobileBusy(true);
        const user = await authenticateWithMobile(bridge, email, password, tenantSlug);
        login(user);
        router.push('/dashboard');
      } catch (err) {
        incrementAttempts();
        if (err instanceof MobileAuthError && err.code === 'otp_required') {
          setMobileView('otp');
        }
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setMobileBusy(false);
      }
    },
    [bridge, login, incrementAttempts, isLocked, router]
  );

  const handleMobileOtpSubmit = useCallback(
    async (email: string, otp: string, tenantSlug?: string) => {
      setError(undefined);
      try {
        if (isLocked()) {
          setLockSeconds(Math.ceil(30));
          return;
        }
        setMobileBusy(true);
        const user = await authenticateWithMobileOtp(bridge, email, otp, tenantSlug);
        login(user);
        router.push('/dashboard');
      } catch (err) {
        incrementAttempts();
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setMobileBusy(false);
      }
    },
    [bridge, login, incrementAttempts, isLocked, router]
  );

  const handleRequestCode = useCallback(
    async (email: string, tenantSlug?: string) => {
      const result = await requestMobileLoginCode(bridge, email, tenantSlug);
      return { devCode: result.devCode };
    },
    [bridge]
  );

  function switchMode(next: 'pin' | 'password' | 'mobile'): void {
    setMode(next);
    setError(undefined);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{deviceConfig.brand.sidebarTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'pin'
              ? 'Select your account to sign in'
              : mode === 'password'
                ? 'Sign in with your username and password'
                : 'Sign in with your WEHA account'}
          </p>
        </div>

        {mode === 'password' ? (
          <PasswordLogin
            onSubmit={handlePasswordSubmit}
            onCancel={() => switchMode('pin')}
            error={error}
            busy={pwBusy}
            showBack={showBack}
          />
        ) : mode === 'mobile' ? (
          !tenantSlugLoaded ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : defaultTenantSlug ? (
            <MobileLogin
              view={mobileView}
              onViewChange={setMobileView}
              onSubmit={handleMobileSubmit}
              onSubmitOtp={handleMobileOtpSubmit}
              onRequestCode={handleRequestCode}
              onCancel={() => switchMode('pin')}
              error={error}
              busy={mobileBusy}
              defaultTenantSlug={defaultTenantSlug}
              showBack={showBack}
            />
          ) : (
            // First-run: no tenant slug saved yet — configure it before the form.
            <TenantSetup onSubmit={handleTenantSetup} busy={tenantBusy} error={error} />
          )
        ) : loading ? (
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

        {otherMethods.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-3">
            {otherMethods.map((m) => (
              <button
                key={m}
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => switchMode(m)}
                data-testid={m === 'password' ? 'toggle-password-login' : 'toggle-mobile-login'}
              >
                {m === 'password' ? 'Sign in with username & password' : 'Sign in with WEHA account'}
              </button>
            ))}
          </div>
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
