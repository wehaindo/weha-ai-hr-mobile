'use client';

// Username + password sign-in form (an alternative to the PIN pad). Presentational:
// it owns the input state and calls `onSubmit(username, password)`; the parent
// (LoginScreen) performs the auth + lockout handling, mirroring PinInput.

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PasswordLoginProps {
  onSubmit: (username: string, password: string) => Promise<void> | void;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}

export default function PasswordLogin({ onSubmit, onCancel, error, busy }: PasswordLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!username.trim() || !password) return;
    void onSubmit(username.trim(), password);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4" data-testid="password-login-form">
      <div className="space-y-2">
        <Label htmlFor="login-username">Username</Label>
        <Input
          id="login-username"
          data-testid="login-username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          data-testid="login-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" data-testid="login-error">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={busy || !username.trim() || !password} data-testid="login-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  );
}
