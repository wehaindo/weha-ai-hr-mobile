import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { EssApiError } from '@/integration/ess/core';
import type {
  AttendanceEventResult,
  AttendanceSubmission,
  EssAttendanceApi,
} from '@/integration/ess/attendance';
import { drainAttendanceQueue } from '@/lib/ess/attendance/sync';
import {
  ATTENDANCE_MAX_ATTEMPTS,
  enqueueAttendanceEvent,
  listPending,
  markAttemptFailed,
  type AttendanceQueueRow,
} from '@/lib/ess/attendance/queue';

let handle: FakeBridgeHandle;

function resultFor(eventId: string, overrides: Partial<AttendanceEventResult> = {}): AttendanceEventResult {
  return {
    id: eventId,
    attendanceType: 'CHECK_IN',
    method: 'GPS',
    status: 'ACCEPTED',
    recordedAt: '2026-10-22T08:02:15.000Z',
    receivedAt: '2026-10-22T08:02:01.220Z',
    worksite: { id: 'ws-1', name: 'Branch' },
    distanceMeters: 10,
    rejectionReason: null,
    duplicateOfEventId: null,
    ...overrides,
  };
}

function submissionFor(eventId: string): AttendanceSubmission {
  return {
    eventId,
    idempotencyKey: eventId,
    method: 'GPS',
    capturedAt: '2026-10-22T08:01:59.000Z',
    location: {
      worksiteId: 'ws-1',
      latitude: -6.2,
      longitude: 106.8,
      accuracyMeters: 10,
      distanceMeters: 10,
      withinGeofence: true,
    },
  };
}

async function enqueue(id: string): Promise<AttendanceQueueRow> {
  const { row } = await enqueueAttendanceEvent(handle.bridge, {
    id,
    employeeId: 'e-1',
    method: 'GPS',
    payload: JSON.stringify(submissionFor(id)),
    idempotencyKey: id,
    capturedAt: '2026-10-22T08:01:59.000Z',
  });
  return row;
}

function apiWith(impl: {
  submitEvent?: EssAttendanceApi['submitEvent'];
  syncEvents?: EssAttendanceApi['syncEvents'];
}): EssAttendanceApi {
  return {
    submitEvent: vi.fn(impl.submitEvent ?? (async () => resultFor('aaaaaaaaaaaaaaa1'))),
    syncEvents: vi.fn(impl.syncEvents ?? (async (subs: AttendanceSubmission[]) => subs.map((s) => resultFor(s.eventId)))),
  } as unknown as EssAttendanceApi;
}

beforeEach(async () => {
  handle = await createFakeBridge();
});

describe('drainAttendanceQueue (BRD FR-09 sync)', () => {
  it('submits a single queued event and stores the accepted outcome + server result', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    const api = apiWith({ submitEvent: async () => resultFor('aaaaaaaaaaaaaaa1') });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.accepted).toBe(1);
    expect(result.results['aaaaaaaaaaaaaaa1'].recordedAt).toBe('2026-10-22T08:02:15.000Z');
    expect(api.submitEvent).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'aaaaaaaaaaaaaaa1' }));
    expect(api.syncEvents).not.toHaveBeenCalled();

    const pending = await listPending(handle.bridge);
    expect(pending).toHaveLength(0);
    const rows = handle.engine.query<AttendanceQueueRow>("SELECT * FROM attendance_queue WHERE status = 'accepted'");
    expect(rows).toHaveLength(1);
    expect(rows[0].attendance_type).toBe('CHECK_IN');
  });

  it('uses the batch sync endpoint for multiple due rows with independent results', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    await enqueue('bbbbbbbbbbbbbbbb');
    const api = apiWith({
      syncEvents: async (subs) =>
        subs.map((s) =>
          s.eventId === 'bbbbbbbbbbbbbbbb'
            ? resultFor(s.eventId, { status: 'REJECTED', recordedAt: null, rejectionReason: 'outside_geofence' })
            : resultFor(s.eventId)
        ),
    });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(api.submitEvent).not.toHaveBeenCalled();
    expect(api.syncEvents).toHaveBeenCalledTimes(1);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);

    const rows = handle.engine.query<AttendanceQueueRow>('SELECT * FROM attendance_queue ORDER BY id');
    expect(rows.find((r) => r.id === 'aaaaaaaaaaaaaaa1')?.status).toBe('accepted');
    expect(rows.find((r) => r.id === 'bbbbbbbbbbbbbbbb')?.rejection_reason).toBe('outside_geofence');
  });

  it('stores server REJECTED outcomes with the reason', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    const api = apiWith({
      submitEvent: async () => resultFor('aaaaaaaaaaaaaaa1', { status: 'REJECTED', recordedAt: null, rejectionReason: 'outside_geofence' }),
    });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.rejected).toBe(1);
    const rows = handle.engine.query<AttendanceQueueRow>("SELECT * FROM attendance_queue WHERE status = 'rejected'");
    expect(rows[0].rejection_reason).toBe('outside_geofence');
  });

  it('resolves DUPLICATE replays like the recorded original (FR-06)', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    const api = apiWith({
      submitEvent: async () => resultFor('aaaaaaaaaaaaaaa1', { status: 'DUPLICATE', duplicateOfEventId: 'aaaaaaaaaaaaaaa1' }),
    });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.duplicated).toBe(1);
    expect(result.accepted).toBe(0);
    const rows = handle.engine.query<AttendanceQueueRow>("SELECT * FROM attendance_queue WHERE status = 'accepted'");
    expect(rows).toHaveLength(1);
  });

  it('re-queues a batch on network loss with one attempt counted per row', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    await enqueue('bbbbbbbbbbbbbbbb');
    const api = apiWith({
      syncEvents: async () => {
        throw new EssApiError('Cannot reach the server.', 0, 'unavailable');
      },
    });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.deferred).toBe(2);
    expect(result.sessionExpired).toBe(false);
    const pending = await listPending(handle.bridge);
    expect(pending).toHaveLength(2);
    for (const row of pending) {
      expect(row.attempts).toBe(1);
      expect(row.last_error).toBe('network unavailable');
    }
    expect(api.syncEvents).toHaveBeenCalledTimes(1);
  });

  it('stops without burning attempts on session expiry', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    await enqueue('bbbbbbbbbbbbbbbb');
    const api = apiWith({
      syncEvents: async () => {
        throw new EssApiError('Session expired.', 401, 'session_expired');
      },
    });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.sessionExpired).toBe(true);
    const pending = await listPending(handle.bridge);
    expect(pending).toHaveLength(2);
    expect(pending[0].attempts).toBe(0); // expiry is not the event's fault
    expect(api.syncEvents).toHaveBeenCalledTimes(1);
  });

  it('parks definitively rejected payloads (400/403/404) as failed immediately', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    const api = apiWith({
      submitEvent: async () => {
        throw new EssApiError('The submitted values are invalid.', 400, 'validation');
      },
    });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.failed).toBe(1);
    const pending = await listPending(handle.bridge);
    expect(pending[0].status).toBe('failed');
    expect(pending[0].attempts).toBe(ATTENDANCE_MAX_ATTEMPTS);
  });

  it('defers rows still inside their exponential backoff window', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    await markAttemptFailed(handle.bridge, 'aaaaaaaaaaaaaaa1', 'network unavailable', 1); // just failed → next due in 10s

    const api = apiWith({});
    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.accepted).toBe(0);
    expect(result.deferred).toBe(1);
    expect(api.submitEvent).not.toHaveBeenCalled();
  });

  it('drains rows past their backoff window (fake time)', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    await markAttemptFailed(handle.bridge, 'aaaaaaaaaaaaaaa1', 'network unavailable', 1);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 11_000); // > base backoff (10s) for attempt 1
      const api = apiWith({});
      const result = await drainAttendanceQueue(handle.bridge, api);
      expect(result.accepted).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects rows whose stored payload is corrupt instead of submitting them', async () => {
    await handle.bridge.db.execute(
      `INSERT INTO attendance_queue (id, employee_id, method, payload, idempotency_key, status, attempts, captured_at, created_at, updated_at)
       VALUES ('corrupt000000001', 'e-1', 'GPS', 'not-json', 'corrupt000000001', 'queued', 0, ?, ?, ?)`,
      ['2026-10-22T08:01:59.000Z', '2026-10-22T08:01:59.000Z', '2026-10-22T08:01:59.000Z']
    );
    const api = apiWith({});

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.rejected).toBe(1);
    expect(api.submitEvent).not.toHaveBeenCalled();
    expect(api.syncEvents).not.toHaveBeenCalled();
  });

  it('recovers rows stuck in submitting before draining', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    await handle.bridge.db.execute(`UPDATE attendance_queue SET status = 'submitting' WHERE id = 'aaaaaaaaaaaaaaa1'`);
    const api = apiWith({});

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.accepted).toBe(1);
  });

  it('defers a batch row missing from the batch results', async () => {
    await enqueue('aaaaaaaaaaaaaaa1');
    await enqueue('bbbbbbbbbbbbbbbb');
    const api = apiWith({ syncEvents: async () => [resultFor('aaaaaaaaaaaaaaa1')] });

    const result = await drainAttendanceQueue(handle.bridge, api);

    expect(result.accepted).toBe(1);
    expect(result.deferred).toBe(1);
    const missing = handle.engine.query<AttendanceQueueRow>("SELECT * FROM attendance_queue WHERE id = 'bbbbbbbbbbbbbbbb'");
    expect(missing[0].status).toBe('queued');
    expect(missing[0].last_error).toBe('missing result in batch');
  });
});
