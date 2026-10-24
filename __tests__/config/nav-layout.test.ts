import { describe, expect, it } from 'vitest';
import { bottomNavForTarget, type AppTarget } from '@/lib/app-target';

describe('bottomNavForTarget', () => {
  it('always uses the bottom nav on cap-mobile, regardless of viewport', () => {
    expect(bottomNavForTarget('cap-mobile', false)).toBe(true);
    expect(bottomNavForTarget('cap-mobile', true)).toBe(true);
  });

  it('is responsive on web: bottom nav only when the viewport is narrow', () => {
    expect(bottomNavForTarget('web', true)).toBe(true);
    expect(bottomNavForTarget('web', false)).toBe(false);
  });

  it('keeps the sidebar on electron and cap-tablet, regardless of viewport', () => {
    const targets: AppTarget[] = ['electron', 'cap-tablet'];
    for (const target of targets) {
      expect(bottomNavForTarget(target, true)).toBe(false);
      expect(bottomNavForTarget(target, false)).toBe(false);
    }
  });
});
