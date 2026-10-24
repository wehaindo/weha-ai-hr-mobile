'use client';

// Email + password (or one-time email code) sign-in against weha-framework's
// mobile auth. Presentational like PasswordLogin: it owns input state and calls
// back with the credentials; the parent (LoginScreen) performs the auth +
// lockout handling.

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type MobileLoginView = 'password' | 'otp';

interface MobileLoginProps {
  view: MobileLoginView;
  onViewChange: (view: MobileLoginView) => void;
  onSubmit: (email: string, password: string, tenantSlug?: string) => Promise<void> | void;
  onSubmitOtp: (email: string, otp: string, tenantSlug?: string) => Promise<void> | void;
  onRequestCode: (email: string, tenantSlug?: string) => Promise<{ devCode?: string }> | { devCode?: string };
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}

export default function MobileLogin({
  view,
  onViewChange,
  onSubmit,
  onSubmitOtp,
  onRequestCode,
  onCancel,
  error,
  busy,
}: MobileLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [tenant, setTenant] = useState('');
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [sendError, setSendError] = useState<string | undefined>(undefined);

  const emailReady = !!email.trim();
  const tenantSlug = tenant.trim() || undefined;

  function handlePasswordSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!emailReady || !password) return;
    void onSubmit(email.trim(), password, tenantSlug);
  }

  function handleOtpSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!emailReady || otp.trim().length < 4) return;
    void onSubmitOtp(email.trim(), otp.trim(), tenantSlug);
  }

  async function handleSendCode(): Promise<void> {
    if (!emailReady || sending) return;
    setSending(true);
    setSendError(undefined);
    try {
      const result = await onRequestCode(email.trim(), tenantSlug);
      setCodeSent(true);
      setDevCode(result?.devCode);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send the code');
    } finally {
      setSending(false);
    }
  }

  function switchView(next: MobileLoginView): void {
    setSendError(undefined);
    setCodeSent(false);
    setDevCode(undefined);
    setOtp('');
    onViewChange(next);
  }

  return (
    <form
      onSubmit={view === 'password' ? handlePasswordSubmit : handleOtpSubmit}
      className="mx-auto w-full max-w-sm space-y-4"
      data-testid="mobile-login-form"
    >
      <div className="space-y-2">
        <Label htmlFor="mobile-email">Email</Label>
        <Input
          id="mobile-email"
          type="email"
          data-testid="mobile-email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setCodeSent(false);
            setDevCode(undefined);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mobile-tenant">Tenant (optional)</Label>
        <Input
          id="mobile-tenant"
          data-testid="mobile-tenant"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="e.g. default"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Required by multi-tenant servers; the value is remembered after a successful sign-in.
        </p>
      </div>

      {view === 'password' ? (
        <div className="space-y-2">
          <Label htmlFor="mobile-password">Password</Label>
          <Input
            id="mobile-password"
            type="password"
            data-testid="mobile-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      ) : (
        <>
          {codeSent && (
            <p className="text-xs text-muted-foreground" data-testid="mobile-code-sent">
              A 6-digit code was emailed to {email.trim()}.
              {devCode && (
                <span className="ml-1 font-mono" data-testid="mobile-devcode">
                  (dev code: {devCode})
                </span>
              )}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="mobile-otp">Login code</Label>
            <Input
              id="mobile-otp"
              data-testid="mobile-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {!codeSent && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void handleSendCode()}
              disabled={!emailReady || sending}
              data-testid="mobile-send-code"
            >
              {sending ? 'Sending…' : 'Email me a login code'}
            </Button>
          )}
          {sendError && (
            <p className="text-sm text-destructive" data-testid="mobile-send-error">
              {sendError}
            </p>
          )}
        </>
      )}

      {error && (
        <p className="text-sm text-destructive" data-testid="mobile-error">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} data-testid="mobile-back">
          Back
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={busy || !emailReady || (view === 'password' ? !password : otp.length < 4)}
          data-testid={view === 'password' ? 'mobile-submit' : 'mobile-otp-submit'}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>

      <div className="text-center">
        <button
          type="button"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => switchView(view === 'password' ? 'otp' : 'password')}
          data-testid={view === 'password' ? 'mobile-toggle-otp' : 'mobile-toggle-password'}
        >
          {view === 'password' ? 'Email me a login code instead' : 'Use my password instead'}
        </button>
      </div>
    </form>
  );
}
