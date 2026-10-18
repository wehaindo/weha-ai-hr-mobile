'use client';

// Reusable settings field components — thin wrappers over the shadcn UI kit so
// every settings tab renders consistent, labeled fields with a save button.
// Each accepts a data-testid for e2e. Keep pages small by composing these.

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** A titled card wrapping a settings section. */
export function SettingsCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** A labeled text input. */
export function SettingsField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  testId,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** A labeled number input. */
export function SettingsNumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  testId,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  testId?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** A labeled toggle/switch. */
export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

/** A labeled select. */
export function SettingsSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  testId?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
        <SelectTrigger data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A labeled textarea. */
export function SettingsTextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  testId?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** A save button with busy state. */
export function SaveButton({
  onSave,
  busy,
  disabled,
  testId,
  label = 'Save',
}: {
  onSave: () => void;
  busy?: boolean;
  disabled?: boolean;
  testId?: string;
  label?: string;
}) {
  return (
    <Button onClick={onSave} disabled={busy || disabled} data-testid={testId}>
      {busy ? 'Saving…' : label}
    </Button>
  );
}
