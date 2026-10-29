// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { computeStatus, lastEvent, type AttendanceEvent } from '@/lib/attendance/status';

function ev(id: string, action: AttendanceEvent['action'], at: string): AttendanceEvent {
  return { id, action, recorded_at: at };
}

describe('computeStatus', () => {
  it('is out with no events', () => {
    expect(computeStatus([])).toBe('out');
  });

  it('is in when the latest event is a check-in', () => {
    // newest-first ordering assumed
    const events = [ev('2', 'CHECK_IN', '2026-01-01T09:00:00Z'), ev('1', 'CHECK_OUT', '2026-01-01T08:00:00Z')];
    expect(computeStatus(events)).toBe('in');
  });

  it('is out when the latest event is a check-out', () => {
    const events = [ev('2', 'CHECK_OUT', '2026-01-01T17:00:00Z'), ev('1', 'CHECK_IN', '2026-01-01T09:00:00Z')];
    expect(computeStatus(events)).toBe('out');
  });

  it('only considers the first (newest) event regardless of older ones', () => {
    const events = [
      ev('3', 'CHECK_IN', '2026-01-01T11:00:00Z'),
      ev('2', 'CHECK_OUT', '2026-01-01T10:00:00Z'),
      ev('1', 'CHECK_IN', '2026-01-01T09:00:00Z'),
    ];
    expect(computeStatus(events)).toBe('in');
  });
});

describe('lastEvent', () => {
  it('returns undefined when empty', () => {
    expect(lastEvent([])).toBeUndefined();
  });

  it('returns the newest event', () => {
    const events = [ev('2', 'CHECK_IN', '2026-01-01T09:00:00Z'), ev('1', 'CHECK_OUT', '2026-01-01T08:00:00Z')];
    expect(lastEvent(events)?.id).toBe('2');
  });
});

describe('sample_attendance migration', () => {
  it('creates the sample_attendance table', async () => {
    const { bridge } = await createFakeBridge();
    const rows = await bridge.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sample_attendance'"
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects an invalid action (CHECK constraint)', async () => {
    const { bridge } = await createFakeBridge();
    await expect(
      bridge.db.execute(
        `INSERT INTO sample_attendance (id, user_id, user_name, action, recorded_at, created_at)
         VALUES ('x', 'u1', 'Test', 'CHECK_IN', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
      )
    ).resolves.toBeUndefined();

    await expect(
      bridge.db.execute(
        `INSERT INTO sample_attendance (id, user_id, user_name, action, recorded_at, created_at)
         VALUES ('y', 'u1', 'Test', 'INVALID', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
      )
    ).rejects.toThrow();
  });
});
