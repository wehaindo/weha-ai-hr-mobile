'use client';

// Layout settings — generic app layout preferences (no POS screen modes).
// Backed by device_settings KV (`layout.*`) via useSettingsGroup.

import { useState } from 'react';
import { toast } from '@/components/ui/toast';
import { useSettingsGroup } from '@/components/settings/use-settings';
import { SettingsCard, SettingsToggle, SettingsSelect, SaveButton } from '@/components/settings/fields';

const DENSITIES = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

const DEFAULTS = {
  sidebarCollapsed: false,
  touchMode: false,
  contentDensity: 'comfortable',
};

export default function LayoutSettingsPage() {
  const { values, set, save, loading } = useSettingsGroup('layout', DEFAULTS);
  const [busy, setBusy] = useState(false);
  void loading;

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await save();
      toast.add({ title: 'Layout settings saved', type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="layout-settings">
      <SettingsCard title="Navigation" description="How the sidebar behaves">
        <SettingsToggle
          label="Collapse sidebar by default"
          description="Start the app with the sidebar in its collapsed (icon-only) state"
          checked={values.sidebarCollapsed}
          onChange={(v) => set('sidebarCollapsed', v)}
          testId="layout-sidebar-collapsed"
        />
      </SettingsCard>

      <SettingsCard title="Interaction" description="Input and density preferences">
        <SettingsToggle
          label="Touch mode"
          description="Larger tap targets for touch screens"
          checked={values.touchMode}
          onChange={(v) => set('touchMode', v)}
          testId="layout-touch-mode"
        />
        <SettingsSelect label="Content density" value={values.contentDensity} onChange={(v) => set('contentDensity', v)} options={DENSITIES} testId="layout-density" />
      </SettingsCard>

      <div className="flex justify-end">
        <SaveButton onSave={() => void handleSave()} busy={busy} testId="save-layout" />
      </div>
    </div>
  );
}
