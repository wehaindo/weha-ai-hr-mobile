// Web/Capacitor display windows — the renderer half of DeviceBridge.display.
// Browser can't target an external display, so a display opens as a new tab
// (the user can fullscreen it). Extracted here so it's testable without the
// sql.js WASM that createRendererBridge needs.

import type { DeviceBridge } from '@/platform/bridge';

export function createRendererDisplay(): DeviceBridge['display'] {
  const windows = new Map<string, Window>();
  return {
    async open(id: string, href: string): Promise<void> {
      const existing = windows.get(id);
      if (existing && !existing.closed) {
        existing.focus();
        return;
      }
      windows.set(id, window.open(href, '_blank') ?? ({} as Window));
    },
    async close(id: string): Promise<void> {
      const win = windows.get(id);
      if (win && !win.closed) win.close();
      windows.delete(id);
    },
    async isOpen(id: string): Promise<boolean> {
      const win = windows.get(id);
      return !!win && !win.closed;
    },
  };
}
