'use client';

// Receipt settings — generic receipt defaults (paper, content flags, auto-print)
// plus a picker for the active receipt template (hardware_templates type='receipt').
// Flags persist to device_settings KV (`receipt.*`); the template id links to the
// print pipeline's resolveReceiptTemplate.

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { toast } from '@/components/ui/toast';
import { useSettingsGroup } from '@/components/settings/use-settings';
import { SettingsCard, SettingsToggle, SettingsSelect, SaveButton } from '@/components/settings/fields';
import type { HardwareTemplate } from '@/types';

const PAPER_SIZES = [
  { value: '58', label: '58mm' },
  { value: '80', label: '80mm' },
];

const DEFAULTS = {
  paperSize: '80',
  showCashier: true,
  showCustomer: true,
  showTax: true,
  showDiscount: true,
  showPayment: true,
  autoPrint: false,
  templateId: '',
};

export default function ReceiptSettingsPage() {
  const bridge = useBridge();
  const { values, set, save, loading } = useSettingsGroup('receipt', DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<HardwareTemplate[]>([]);
  void loading;

  const loadTemplates = useCallback(async () => {
    try {
      const rows = await bridge.db.query<HardwareTemplate>(
        "SELECT * FROM hardware_templates WHERE type = 'receipt' AND is_active = 1 ORDER BY is_default DESC, name ASC"
      );
      setTemplates(rows);
    } catch {
      /* no templates yet */
    }
  }, [bridge]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await save();
      toast.add({ title: 'Receipt settings saved', type: 'success' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const templateOptions = [
    { value: '', label: 'Default (resolve by printer)' },
    ...templates.map((t) => ({ value: t.id, label: `${t.name} (${t.paper_width}mm)` })),
  ];

  return (
    <div className="space-y-4" data-testid="receipt-settings">
      <SettingsCard title="Paper" description="Default receipt paper width">
        <SettingsSelect label="Paper size" value={values.paperSize} onChange={(v) => set('paperSize', v)} options={PAPER_SIZES} testId="receipt-paper-size" />
      </SettingsCard>

      <SettingsCard title="Content" description="Which receipt sections to show">
        <SettingsToggle label="Show cashier" checked={values.showCashier} onChange={(v) => set('showCashier', v)} testId="receipt-show-cashier" />
        <SettingsToggle label="Show customer" checked={values.showCustomer} onChange={(v) => set('showCustomer', v)} testId="receipt-show-customer" />
        <SettingsToggle label="Show tax" checked={values.showTax} onChange={(v) => set('showTax', v)} testId="receipt-show-tax" />
        <SettingsToggle label="Show discount" checked={values.showDiscount} onChange={(v) => set('showDiscount', v)} testId="receipt-show-discount" />
        <SettingsToggle label="Show payment details" checked={values.showPayment} onChange={(v) => set('showPayment', v)} testId="receipt-show-payment" />
      </SettingsCard>

      <SettingsCard title="Printing" description="Template + auto-print behavior">
        <SettingsSelect label="Receipt template" value={values.templateId} onChange={(v) => set('templateId', v)} options={templateOptions} testId="receipt-template" />
        <SettingsToggle
          label="Auto-print"
          description="Print automatically when a receipt is ready"
          checked={values.autoPrint}
          onChange={(v) => set('autoPrint', v)}
          testId="receipt-auto-print"
        />
      </SettingsCard>

      <div className="flex justify-end">
        <SaveButton onSave={() => void handleSave()} busy={busy} testId="save-receipt" />
      </div>
    </div>
  );
}
