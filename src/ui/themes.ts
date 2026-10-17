// Theme presets (accent palettes on top of light/dark mode).
// Stored in localStorage, applied as data-theme on <html>; see globals.css.

export const THEME_PRESETS = [
  { id: 'default', label: 'Amber' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'contrast', label: 'High Contrast' },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]['id'];

const STORAGE_KEY = 'device-theme-preset';

export function applyThemePreset(id: string): void {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem(STORAGE_KEY, id);
}

export function initThemePreset(): void {
  const stored = localStorage.getItem(STORAGE_KEY) ?? 'default';
  document.documentElement.setAttribute('data-theme', stored);
}

export function getStoredThemePreset(): string {
  return localStorage.getItem(STORAGE_KEY) ?? 'default';
}
