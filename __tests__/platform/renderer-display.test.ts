// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRendererDisplay } from '@/platform/renderer-display';

describe('renderer display (web fallback)', () => {
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openSpy = vi.fn();
    // window.open returns a fake Window-like object.
    vi.stubGlobal('window', { ...window, open: openSpy });
  });

  it('opens a new tab and tracks it by id', async () => {
    const fakeWin = { closed: false, focus: vi.fn(), close: vi.fn() };
    openSpy.mockReturnValue(fakeWin);

    const display = createRendererDisplay();
    await display.open('customer-display', '/customer-display');

    expect(openSpy).toHaveBeenCalledWith('/customer-display', '_blank');
    expect(await display.isOpen('customer-display')).toBe(true);
  });

  it('focuses rather than opening a second tab when already open', async () => {
    const fakeWin = { closed: false, focus: vi.fn(), close: vi.fn() };
    openSpy.mockReturnValue(fakeWin);

    const display = createRendererDisplay();
    await display.open('kiosk', '/kiosk');
    await display.open('kiosk', '/kiosk');

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(fakeWin.focus).toHaveBeenCalled();
  });

  it('closes the tracked window and reports not-open', async () => {
    const fakeWin = { closed: false, focus: vi.fn(), close: vi.fn() };
    openSpy.mockReturnValue(fakeWin);

    const display = createRendererDisplay();
    await display.open('kitchen', '/kitchen');
    expect(await display.isOpen('kitchen')).toBe(true);

    fakeWin.closed = true;
    expect(await display.isOpen('kitchen')).toBe(false);
  });

  it('reports not-open for an unknown id', async () => {
    const display = createRendererDisplay();
    expect(await display.isOpen('nope')).toBe(false);
  });
});
