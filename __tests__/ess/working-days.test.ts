import { describe, expect, it } from 'vitest';
import { estimateWorkingDays } from '@/lib/ess/requests/working-days';

describe('estimateWorkingDays (display-only — server is authoritative)', () => {
  it('counts weekdays inclusive and skips weekends', () => {
    // 2026-11-02 is a Monday
    expect(estimateWorkingDays('2026-11-02', '2026-11-04')).toBe(3);
    expect(estimateWorkingDays('2026-11-02', '2026-11-02')).toBe(1);
    expect(estimateWorkingDays('2026-11-06', '2026-11-09')).toBe(2); // Fri + Mon
  });

  it('returns 0 for reversed or invalid ranges', () => {
    expect(estimateWorkingDays('2026-11-04', '2026-11-02')).toBe(0);
    expect(estimateWorkingDays('nope', '2026-11-02')).toBe(0);
  });

  it('handles a full week', () => {
    expect(estimateWorkingDays('2026-11-02', '2026-11-08')).toBe(5);
  });
});
