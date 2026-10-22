// Attendance offline queue (BRD FR-09) — repository over the local
// `attendance_queue` table (migration 0026). One row per captured event:
// immutable `payload` evidence + submission state. Local rejections are
// recorded too (never submitted); queued rows drain via sync.ts.

import type { DeviceBridge } from '@/platform';

export type AttendanceQueueStatus = 'queued' | 'submitting' | 'accepted' | 'rejected' | 'failed';

/** Give up after this many submit attempts → status 'failed' (manual retry). */
export const ATTENDANCE_MAX_ATTEMPTS = 8;

export interface AttendanceQueueRow {
  id: string;
  employee_id: string;
  method: string;
  payload: string;
  idempotency_key: string;
  status: AttendanceQueueStatus;
  attendance_type: string | null;
  rejection_reason: string | null;
  attempts: number;
  last_error: string | null;
  captured_at: string;
  created_at: string;
  updated_at: string;
}

export interface EnqueueInput {
  /** Event id (16-hex, `generateId()`). */
  id: string;
  employeeId: string;
  method: 'GPS' | 'QR';
  /** JSON request body — immutable capture evidence. */
  payload: string;
  idempotencyKey: string;
  capturedAt: string;
  /** 'rejected' records a client-side policy rejection that is never submitted. */
  status?: 'queued' | 'rejected';
  rejectionReason?: string;
}

const SELECT_COLUMNS = `id, employee_id, method, payload, idempotency_key, status,
  attendance_type, rejection_reason, attempts, last_error, captured_at, created_at, updated_at`;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Insert a captured event. Returns the existing row (created: false) when the
 * idempotency key already exists — a double callback or replayed capture never
 * creates a second queue entry (BRD FR-06).
 */
export async function enqueueAttendanceEvent(
  bridge: DeviceBridge,
  input: EnqueueInput
): Promise<{ row: AttendanceQueueRow; created: boolean }> {
  try {
    await bridge.db.execute(
      `INSERT INTO attendance_queue (id, employee_id, method, payload, idempotency_key, status, rejection_reason, attempts, captured_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        input.id,
        input.employeeId,
        input.method,
        input.payload,
        input.idempotencyKey,
        input.status ?? 'queued',
        input.rejectionReason ?? null,
        input.capturedAt,
        nowIso(),
        nowIso(),
      ]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/UNIQUE|constraint/i.test(message)) {
      const existing = await getRowBy(bridge, 'idempotency_key', input.idempotencyKey);
      if (existing) return { row: existing, created: false };
    }
    throw err;
  }
  const row = await getRowBy(bridge, 'id', input.id);
  if (!row) throw new Error('attendance_queue: row disappeared after insert');
  return { row, created: true };
}

async function getRowBy(
  bridge: DeviceBridge,
  column: 'id' | 'idempotency_key',
  value: string
): Promise<AttendanceQueueRow | null> {
  const rows = await bridge.db.query<AttendanceQueueRow>(
    `SELECT ${SELECT_COLUMNS} FROM attendance_queue WHERE ${column} = ?`,
    [value]
  );
  return rows[0] ?? null;
}

/**
 * Reset rows stuck in 'submitting' (app killed mid-submit) so the drain can
 * retry them — the server's idempotency makes the replay safe.
 */
export async function recoverStuckSubmitting(bridge: DeviceBridge): Promise<void> {
  await bridge.db.execute(
    `UPDATE attendance_queue SET status = 'queued', updated_at = ? WHERE status = 'submitting'`,
    [nowIso()]
  );
}

/** Queued rows in capture order (backoff filtering happens in sync.ts). */
export async function claimQueued(bridge: DeviceBridge, limit = 20): Promise<AttendanceQueueRow[]> {
  return bridge.db.query<AttendanceQueueRow>(
    `SELECT ${SELECT_COLUMNS} FROM attendance_queue WHERE status = 'queued' ORDER BY captured_at ASC, id ASC LIMIT ?`,
    [limit]
  );
}

export async function markSubmitting(bridge: DeviceBridge, id: string): Promise<void> {
  await bridge.db.execute(`UPDATE attendance_queue SET status = 'submitting', updated_at = ? WHERE id = ?`, [
    nowIso(),
    id,
  ]);
}

/** Server accepted the event (or it was folded into one — store the resolution). */
export async function markAccepted(
  bridge: DeviceBridge,
  id: string,
  result: { attendanceType?: string | null } = {}
): Promise<void> {
  await bridge.db.execute(
    `UPDATE attendance_queue
     SET status = 'accepted', attendance_type = COALESCE(?, attendance_type),
         rejection_reason = NULL, last_error = NULL, updated_at = ?
     WHERE id = ?`,
    [result.attendanceType ?? null, nowIso(), id]
  );
}

export async function markRejected(bridge: DeviceBridge, id: string, reason: string): Promise<void> {
  await bridge.db.execute(
    `UPDATE attendance_queue SET status = 'rejected', rejection_reason = ?, last_error = NULL, updated_at = ? WHERE id = ?`,
    [reason, nowIso(), id]
  );
}

/**
 * A submit attempt failed with a transport/server error: count it and either
 * re-queue (backoff applies) or park as 'failed' once the cap is reached.
 */
export async function markAttemptFailed(bridge: DeviceBridge, id: string, error: string, attempts: number): Promise<'queued' | 'failed'> {
  const status = attempts >= ATTENDANCE_MAX_ATTEMPTS ? 'failed' : 'queued';
  await bridge.db.execute(
    `UPDATE attendance_queue SET status = ?, attempts = ?, last_error = ?, updated_at = ? WHERE id = ?`,
    [status, attempts, error, nowIso(), id]
  );
  return status;
}

/** Manual retry from the UI: park every 'failed' row back into the queue. */
export async function retryFailed(bridge: DeviceBridge): Promise<number> {
  const rows = await bridge.db.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM attendance_queue WHERE status = 'failed'`
  );
  if ((rows[0]?.c ?? 0) === 0) return 0;
  await bridge.db.execute(
    `UPDATE attendance_queue SET status = 'queued', attempts = 0, last_error = NULL, updated_at = ? WHERE status = 'failed'`,
    [nowIso()]
  );
  return rows[0].c;
}

/**
 * Connectivity changed ('online'): give queued rows a fresh immediate retry
 * instead of waiting out the offline backoff.
 */
export async function resetQueuedBackoff(bridge: DeviceBridge): Promise<void> {
  await bridge.db.execute(
    `UPDATE attendance_queue SET attempts = 0, updated_at = ? WHERE status = 'queued' AND attempts > 0`,
    [nowIso()]
  );
}

/** Unresolved rows for the pending-sync banner (queued, submitting, failed). */
export async function listPending(bridge: DeviceBridge): Promise<AttendanceQueueRow[]> {
  return bridge.db.query<AttendanceQueueRow>(
    `SELECT ${SELECT_COLUMNS} FROM attendance_queue
     WHERE status IN ('queued', 'submitting', 'failed')
     ORDER BY captured_at ASC, id ASC`
  );
}

/** Local rows captured between two instants (e.g. today) — merged into the day view. */
export async function listBetween(
  bridge: DeviceBridge,
  fromIso: string,
  toIso: string
): Promise<AttendanceQueueRow[]> {
  return bridge.db.query<AttendanceQueueRow>(
    `SELECT ${SELECT_COLUMNS} FROM attendance_queue
     WHERE captured_at >= ? AND captured_at < ? ORDER BY captured_at ASC, id ASC`,
    [fromIso, toIso]
  );
}
