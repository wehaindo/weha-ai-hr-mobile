'use client';

// Generic, metadata-driven form for a testing model: renders fields by type
// (text/number/boolean/date/combobox/textarea), loads combobox options for
// fields backed by another model (`source`), validates required fields, and
// emits a values object keyed by column. No per-model code.

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FieldMeta, FieldOption, FieldSource, TestModelMeta } from '@/testing/models';

type Values = Record<string, string | number | boolean>;

interface ModelFormProps {
  meta: TestModelMeta;
  initial?: Record<string, unknown> | null;
  loadOptions?: (source: FieldSource) => Promise<FieldOption[]>;
  onSubmit: (values: Values) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

function defaultFor(f: FieldMeta): string | number | boolean {
  if (f.default !== undefined) return f.default;
  if (f.type === 'boolean') return false;
  if (f.type === 'number') return 0;
  return '';
}

function coerceForInput(f: FieldMeta, raw: unknown): string | number | boolean {
  if (raw === null || raw === undefined) return defaultFor(f);
  if (f.type === 'boolean') return raw === 1 || raw === true || raw === '1';
  if (f.type === 'number') return Number(raw) || 0;
  if (f.type === 'date') return String(raw).slice(0, 10);
  return String(raw);
}

export default function ModelForm({ meta, initial, loadOptions, onSubmit, onCancel, busy }: ModelFormProps) {
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of meta.fields) v[f.name] = initial ? coerceForInput(f, initial[f.name]) : defaultFor(f);
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sourceOptions, setSourceOptions] = useState<Record<string, FieldOption[]>>({});

  const sourceFields = useMemo(() => meta.fields.filter((f) => f.source), [meta]);

  useEffect(() => {
    let cancelled = false;
    for (const f of sourceFields) {
      if (!loadOptions || !f.source) continue;
      void loadOptions(f.source).then((opts) => {
        if (!cancelled) setSourceOptions((prev) => ({ ...prev, [f.name]: opts }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [sourceFields, loadOptions]);

  function set(name: string, value: string | number | boolean): void {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const f of meta.fields) {
      if (!f.required) continue;
      const v = values[f.name];
      if (v === '' || v === null || v === undefined) errs[f.name] = `${f.label} is required`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(): Promise<void> {
    if (!validate()) return;
    await onSubmit(values);
  }

  function renderField(f: FieldMeta) {
    const v = values[f.name];
    switch (f.type) {
      case 'boolean':
        return (
          <Switch
            checked={Boolean(v)}
            onCheckedChange={(checked) => set(f.name, checked)}
            aria-label={f.label}
            data-testid={`field-${f.name}`}
          />
        );
      case 'textarea':
        return (
          <Textarea
            value={String(v ?? '')}
            onChange={(e) => set(f.name, e.target.value)}
            data-testid={`field-${f.name}`}
          />
        );
      case 'combobox': {
        const opts = f.source ? (sourceOptions[f.name] ?? []) : (f.options ?? []);
        return (
          <Select value={String(v ?? '')} onValueChange={(val) => set(f.name, val ?? '')} data-testid={`field-${f.name}`}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`Select ${f.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {opts.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      case 'number':
        return (
          <Input
            type="number"
            value={Number(v ?? 0)}
            onChange={(e) => set(f.name, e.target.value === '' ? 0 : Number(e.target.value))}
            data-testid={`field-${f.name}`}
          />
        );
      case 'date':
        return (
          <Input
            type="date"
            value={String(v ?? '')}
            onChange={(e) => set(f.name, e.target.value)}
            data-testid={`field-${f.name}`}
          />
        );
      default:
        return (
          <Input
            value={String(v ?? '')}
            onChange={(e) => set(f.name, e.target.value)}
            data-testid={`field-${f.name}`}
          />
        );
    }
  }

  return (
    <div className="space-y-4">
      {meta.fields.map((f) => (
        <div key={f.name} className="space-y-1.5">
          <Label htmlFor={`field-${f.name}`}>
            {f.label}
            {f.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {renderField(f)}
          {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>}
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={busy} data-testid="form-save">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
