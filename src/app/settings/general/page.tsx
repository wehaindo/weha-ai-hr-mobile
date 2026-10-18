'use client';

// General settings — device + business identity, genericized for any device
// app (no POS-only fields). Backed by device_settings KV (`general.*`) via the
// reusable useSettingsGroup hook.

import { useState } from 'react';
import { toast } from '@/components/ui/toast';
import { useSettingsGroup } from '@/components/settings/use-settings';
import { SettingsCard, SettingsField, SettingsSelect, SaveButton } from '@/components/settings/fields';

const TIMEZONES = [
  'UTC',
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
].map((tz) => ({ value: tz, label: tz }));

const DEFAULTS = {
  deviceName: '',
  businessName: '',
  logoUrl: '',
  timezone: 'UTC',
};

export default function GeneralSettingsPage() {
  const { values, set, save } = useSettingsGroup('general', DEFAULTS);
  const [busy, setBusy] = useState(false);

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await save();
      toast.add({ title: 'General settings saved', type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="general-settings">
      <SettingsCard title="Device" description="Identity shown across the application">
        <SettingsField label="Device name" value={values.deviceName} onChange={(v) => set('deviceName', v)} placeholder="Front desk device" testId="general-device-name" />
        <SettingsField label="Logo URL" value={values.logoUrl} onChange={(v) => set('logoUrl', v)} placeholder="https://…/logo.png" testId="general-logo-url" />
      </SettingsCard>

      <SettingsCard title="Business" description="Business profile shown on documents">
        <SettingsField label="Business name" value={values.businessName} onChange={(v) => set('businessName', v)} placeholder="Acme Inc." testId="general-business-name" />
      </SettingsCard>

      <SettingsCard title="Regional" description="Locale defaults">
        <SettingsSelect label="Timezone" value={values.timezone} onChange={(v) => set('timezone', v)} options={TIMEZONES} testId="general-timezone" />
      </SettingsCard>

      <div className="flex justify-end">
        <SaveButton onSave={() => void handleSave()} busy={busy} testId="save-general" />
      </div>
    </div>
  );
}
