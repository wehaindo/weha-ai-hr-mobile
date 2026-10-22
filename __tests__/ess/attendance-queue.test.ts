import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import {
  ATTENDANCE_MAX_ATTEMPTS,
  claimQueued,
  enqueueAttendanceEvent,
  listBetween,
  listPending,
  markAccepted,
  markAttemptFailed,
  markRejected,
  markSubmitting,
  recoverStuckSubmitting,
  resetQueuedBackoff,
  retryFailed,
  type AttendanceQueueRow,
} from '@/lib/ess/attendance/queue';

let handle: FakeBridgeHandle;

function input(overrides: Partial<Parameters<typeof enqueueAttendanceEvent>[1]> = {}) {
  return {
    id: 'aaaaaaaaaaaaaaa1',
    employeeId: 'e-1',
    method: 'GPS' as const,
    payload: JSON.stringify({ eventId: 'aaaaaaaaaaaaaaa1', method: 'GPS' }),
    idempotencyKey: 'aaaaaaaaaaaaaaa1',
    capturedAt: '2026-10-22T08:01:59.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  handle = await createFakeBridge();
});

describe('attendance queue (offline capture)', () => {
  it('enqueues a queued row readable by id', async () => {
    const { row, created } = await enqueueAttendanceEvent(handle.bridge, input());

    expect(created).toBe(true);
    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(0);
    expect(row.captured_at).toBe('2026-10-22T08:01:59.000Z');

    const claimed = await claimQueued(handle.bridge);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe('aaaaaaaaaaaaaaa1');
  });

  it('dedupes on idempotency key: a replay returns the existing row, no second entry', async () => {
    await enqueueAttendanceEvent(handle.bridge, input());
    const replay = await enqueueAttendanceEvent(
      handle.bridge,
      input({ id: 'bbbbbbbbbbbbbbbb' })
    );

    expect(replay.created).toBe(false);
    expect(replay.row.id).toBe('aaaaaaaaaaaaaaa1');
    const pending = await listPending(handle.bridge);
    expect(pending).toHaveLength(1);
  });

  it('records a local rejection that is never claimed for submission', async () => {
    await enqueueAttendanceEvent(
      handle.bridge,
      input({ status: 'rejected', rejectionReason: 'outside_geofence' })
    );

    expect(await claimQueued(handle.bridge)).toHaveLength(0);
    const pending = await listPending(handle.bridge);
    expect(pending).toHaveLength(0); // rejected is terminal, not pending
    const [row] = await listBetween(handle.bridge, '2026-10-22T00:00:00.000Z', '2026-10-23T00:00:00.000Z');
    expect(row.status).toBe('rejected');
    expect(row.rejection_reason).toBe('outside_geofence');
  });

  it('recovers rows stuck in submitting back to queued', async () => {
    await enqueueAttendanceEvent(handle.bridge, input());
    await markSubmitting(handle.bridge, 'aaaaaaaaaaaaaaa1');
    expect(await claimQueued(handle.bridge)).toHaveLength(0);

    await recoverStuckSubmitting(handle.bridge);

    const claimed = await claimQueued(handle.bridge);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].status).toBe('queued');
  });

  it('applies the attempt cap: re-queue until ATTENDANCE_MAX_ATTEMPTS then fail', async () => {
    await enqueueAttendanceEvent(handle.bridge, input());

    let status: 'queued' | 'failed' = 'queued';
    for (let attempts = 1; attempts <= ATTENDANCE_MAX_ATTEMPTS; attempts++) {
      status = await markAttemptFailed(handle.bridge, 'aaaaaaaaaaaaaaa1', 'network down', attempts);
    }

    expect(status).toBe('failed');
    const [row] = await listPending(handle.bridge);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(ATTENDANCE_MAX_ATTEMPTS);
    expect(row.last_error).toBe('network down');
    expect(await claimQueued(handle.bridge)).toHaveLength(0);
  });

  it('resetQueuedBackoff clears attempts on queued rows only', async () => {
    await enqueueAttendanceEvent(handle.bridge, input());
    await markAttemptFailed(handle.bridge, 'aaaaaaaaaaaaaaa1', 'network down', 3);
    await enqueueAttendanceEvent(
      handle.bridge,
      input({ id: 'bbbbbbbbbbbbbbbb', idempotencyKey: 'bbbbbbbbbbbbbbbb' })
    );
    await markSubmitting(handle.bridge, 'bbbbbbbbbbbbbbbb');

    await resetQueuedBackoff(handle.bridge);

    const [retried] = await claimQueued(handle.bridge);
    expect(retried.id).toBe('aaaaaaaaaaaaaaa1');
    expect(retried.attempts).toBe(0);
    const stuck = handle.engine.query<AttendanceQueueRow>("SELECT * FROM attendance_queue WHERE id = 'bbbbbbbbbbbbbbbb'");
    expect(stuck[0].attempts).toBe(0); // untouched (was submitting, not queued)
    expect(stuck[0].status).toBe('submitting');
  });

  it('manual retry parks failed rows back into the queue with reset attempts', async () => {
    await enqueueAttendanceEvent(handle.bridge, input());
    await markAttemptFailed(handle.bridge, 'aaaaaaaaaaaaaaa1', 'network down', ATTENDANCE_MAX_ATTEMPTS);

    expect(await retryFailed(handle.bridge)).toBe(1);

    const claimed = await claimQueued(handle.bridge);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].attempts).toBe(0);
    expect(claimed[0].last_error).toBeNull();
    expect(await retryFailed(handle.bridge)).toBe(0); // nothing left to retry
  });

  it('stores server outcomes: accepted keeps the resolved type, rejected keeps the reason', async () => {
    await enqueueAttendanceEvent(handle.bridge, input());
    await markSubmitting(handle.bridge, 'aaaaaaaaaaaaaaa1');
    await markAccepted(handle.bridge, 'aaaaaaaaaaaaaaa1', { attendanceType: 'CHECK_IN' });

    await enqueueAttendanceEvent(
      handle.bridge,
      input({ id: 'cccccccccccccccc', idempotencyKey: 'cccccccccccccccc', method: 'QR' })
    );
    await markRejected(handle.bridge, 'cccccccccccccccc', 'invalid_qr');

    const pending = await listPending(handle.bridge);
    expect(pending).toHaveLength(0);

    const [accepted, rejected] = await listBetween(
      handle.bridge,
      '2026-10-22T00:00:00.000Z',
      '2026-10-23T00:00:00.000Z'
    );
    expect(accepted.status).toBe('accepted');
    expect(accepted.attendance_type).toBe('CHECK_IN');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejection_reason).toBe('invalid_qr');
  });

  it('listBetween only returns rows inside the window', async () => {
    await enqueueAttendanceEvent(handle.bridge, input({ capturedAt: '2026-10-22T08:00:00.000Z' }));
    await enqueueAttendanceEvent(
      handle.bridge,
      input({ id: 'dddddddddddddddd', idempotencyKey: 'dddddddddddddddd', capturedAt: '2026-10-21T08:00:00.000Z' })
    );

    const rows = await listBetween(handle.bridge, '2026-10-22T00:00:00.000Z', '2026-10-23T00:00:00.000Z');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('aaaaaaaaaaaaaaa1');
  });

  it('rejects an insert violating the primary key and reports no phantom existing row for a different key', async () => {
    await enqueueAttendanceEvent(handle.bridge, input());
    // Same id but a different idempotency key → UNIQUE(id) failure without an
    // idempotency match → the error must surface, not silently succeed.
    await expect(
      enqueueAttendanceEvent(handle.bridge, input({ idempotencyKey: 'eeeeeeeeeeeeeeee' }))
    ).rejects.toThrow();
  });
});

describe('migration 0026 (attendance_queue)', () => {
  it('creates the table with the unique idempotency constraint', async () => {
    const tables = handle.engine
      .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attendance_queue'")
      .map((r: { name: string }) => r.name);
    expect(tables).toEqual(['attendance_queue']);

    const row = handle.engine.query<AttendanceQueueRow>('SELECT * FROM attendance_queue');
    expect(row).toHaveLength(0);
    expect(() =>
      handle.engine.execute('INSERT INTO attendance_queue (id, employee_id, method, payload, idempotency_key, captured_at) VALUES (?,?,?,?,?,?)', [
        'x', 'e-1', 'GPS', '{}', 'k1', '2026-10-22T00:00:00.000Z',
      ])
    ).not.toThrow();
    expect(() =>
      handle.engine.execute('INSERT INTO attendance_queue (id, employee_id, method, payload, idempotency_key, captured_at) VALUES (?,?,?,?,?,?)', [
        'y', 'e-1', 'GPS', '{}', 'k1', '2026-10-22T00:00:00.000Z',
      ])
    ).toThrow(/UNIQUE|constraint/i);
  });
});
