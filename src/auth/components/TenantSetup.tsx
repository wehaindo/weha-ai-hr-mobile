'use client';

// First-run tenant setup — shown instead of the WEHA-account login form until a
// tenant slug has been saved. Presentational like PasswordLogin: it owns the
// input state and calls back with the value; the parent (LoginScreen) persists
// it and flips to the login form. Required (no skip): a multi-tenant backend
// rejects an empty slug with "tenantSlug is required".

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TenantSetupProps {
  onSubmit: (slug: string) => Promise<void> | void;
  busy?: boolean;
  error?: string;
}

export default function TenantSetup({ onSubmit, busy = false, error }: TenantSetupProps) {
  const [slug, setSlug] = useState('');

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const value = slug.trim();
    if (!value) return;
    void onSubmit(value);
  }

  const ready = !!slug.trim() && !busy;

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4" data-testid="tenant-setup-form">
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium">First-time setup</p>
        <p className="text-xs text-muted-foreground">
          Enter your workspace tenant slug to continue. It is saved on this device and reused for
          every sign-in.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tenant-slug">Tenant slug</Label>
        <Input
          id="tenant-slug"
          data-testid="tenant-setup-input"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="e.g. default"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" data-testid="tenant-setup-error">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={!ready} data-testid="tenant-setup-save">
        {busy ? 'Saving…' : 'Save & continue'}
      </Button>
    </form>
  );
}
