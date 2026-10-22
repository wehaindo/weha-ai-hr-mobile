'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { THEME_PRESETS, applyThemePreset, getStoredThemePreset } from '@/ui/themes';
import { cn } from '@/lib/utils';

const PRESET_COLORS: Record<string, string> = {
  default: 'oklch(0.769 0.188 70.08)',
  ocean: 'oklch(0.6 0.15 240)',
  contrast: 'oklch(0 0 0)',
};

export default function AppearanceSettingsPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [preset, setPreset] = useState<string>('default');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPreset(getStoredThemePreset());
  }, []);

  if (!mounted) return null;

  return (
    <div className="space-y-4" data-testid="appearance-settings">
      <Card>
        <CardHeader>
          <CardTitle>Mode</CardTitle>
          <CardDescription>Light or dark appearance</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {(['light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              data-testid={`mode-${mode}`}
              onClick={() => setTheme(mode)}
              className={cn(
                'rounded-lg border-2 px-6 py-3 text-sm font-medium capitalize transition-colors',
                resolvedTheme === mode ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
              )}
            >
              {mode}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accent preset</CardTitle>
          <CardDescription>Color theme applied on top of light/dark mode</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {THEME_PRESETS.map((theme) => (
            <button
              key={theme.id}
              data-testid={`preset-${theme.id}`}
              onClick={() => {
                applyThemePreset(theme.id);
                setPreset(theme.id);
              }}
              className={cn(
                'flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors',
                preset === theme.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
              )}
            >
              <span
                className="h-5 w-5 rounded-full"
                style={{ backgroundColor: PRESET_COLORS[theme.id] }}
              />
              {theme.label}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
