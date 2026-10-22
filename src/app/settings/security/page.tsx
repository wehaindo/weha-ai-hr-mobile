'use client';

// Security settings — session/lockout policy. max_login_attempts is enforced by
// the auth store (configureLockout); session/auto-lock minutes are stored for an
// idle effect in AppRuntime. Unlike ai-pos (dead config), attempts actually lock.

import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/toast';
import deviceConfig from '@/device.config';
import { useAuthStore } from '@/stores/auth';
import { useSettingsGroup, useSetting } from '@/components/settings/use-settings';
import { SettingsCard, SettingsField, SettingsNumberField, SaveButton } from '@/components/settings/fields';

const DEFAULTS = {
  maxLoginAttempts: 5,
  sessionTimeoutMinutes: 480,
  autoLockMinutes: 0,
};

export default function SecuritySettingsPage() {
  const { values, set, save } = useSettingsGroup('security', DEFAULTS);
  const {
    value: storedTenantSlug,
    setValue: persistTenantSlug,
    loading: slugLoading,
  } = useSetting<string>('auth.mobileTenantSlug', '');
  const [tenantSlug, setTenantSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const configureLockout = useAuthStore((s) => s.configureLockout);

  // Apply the stored lockout policy on load so it takes effect app-wide.
  useEffect(() => {
    configureLockout(values.maxLoginAttempts, 30000);
  }, [values.maxLoginAttempts, configureLockout]);

  // Seed the local input from the persisted value once loading finishes
  // (writes happen on save, not per keystroke).
  useEffect(() => {
    if (!slugLoading) setTenantSlug(storedTenantSlug ?? '');
  }, [slugLoading, storedTenantSlug]);

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await save();
      await persistTenantSlug(tenantSlug.trim());
      configureLockout(values.maxLoginAttempts, 30000);
      toast.add({ title: 'Security settings saved', type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="security-settings">
      <SettingsCard title="Login" description="Failed-attempt lockout policy">
        <SettingsNumberField
          label="Max login attempts"
          description="Consecutive failed PINs before the device locks"
          value={values.maxLoginAttempts}
          onChange={(v) => set('maxLoginAttempts', v)}
          min={1}
          max={20}
          testId="security-max-attempts"
        />
      </SettingsCard>

      <SettingsCard title="Session" description="Idle timeout behavior">
        <SettingsNumberField
          label="Session timeout (minutes)"
          description="Log out after this many minutes of inactivity (0 = never)"
          value={values.sessionTimeoutMinutes}
          onChange={(v) => set('sessionTimeoutMinutes', v)}
          min={0}
          testId="security-session-timeout"
        />
        <SettingsNumberField
          label="Auto-lock (minutes)"
          description="Return to the lock screen after inactivity (0 = never)"
          value={values.autoLockMinutes}
          onChange={(v) => set('autoLockMinutes', v)}
          min={0}
          testId="security-auto-lock"
        />
      </SettingsCard>

      <SettingsCard
        title="Mobile login (WEHA account)"
        description="Sign in against weha-framework — requires the framework to be reachable"
      >
        <SettingsField
          label="Tenant slug"
          value={tenantSlug}
          onChange={setTenantSlug}
          placeholder="leave empty for single-tenant"
          testId="security-mobile-tenant"
        />
        <p className="text-xs text-muted-foreground">
          Framework URL: <span className="font-mono">{deviceConfig.erp.baseUrl}</span>
        </p>
      </SettingsCard>

      <div className="flex justify-end">
        <SaveButton onSave={() => void handleSave()} busy={busy} testId="save-security" />
      </div>
    </div>
  );
}
