// Offline attendance drain (BRD FR-09): push queued capture events to the
// backend with their idempotency keys and store the authoritative result.
// One due row → POST /attendance/events; several → the batch
// POST /attendance/events/sync (contract §3.6). The hook owns the triggers
// (mount / after punch / 'online' / interval while pending > 0).

import type { DeviceBridge } from '@/platform';
import { EssApiError } from '@/integration/ess/core';
import type {
  AttendanceEventResult,
  AttendanceSubmission,
  EssAttendanceApi,
} from '@/integration/ess/attendance';
import { offlineBackoffMs } from '@/lib/offline/backoff';
import { ATTENDANCE_MAX_ATTEMPTS, claimQueued, markAccepted, markAttemptFailed, markRejected, markSubmitting, recoverStuckSubmitting, type AttendanceQueueRow } from './queue';

export interface DrainResult {
  accepted: number;
  /** Server rejected the event (reason stored on the row). */
  rejected: number;
  /** Server folded the key into an original result (FR-06 replay). */
  duplicated: number;
  /** Still queued: backoff, rate limit or network — will retry later. */
  deferred: number;
  /** Rows parked as 'failed' after the attempt cap or a definitive 4xx. */
  failed: number;
  /** Stop the drain and let the hook run session expiry handling. */
  sessionExpired: boolean;
  /** Server results keyed by event id (used for the punch confirmation). */
  results: Record<string, AttendanceEventResult>;
}

function emptyResult(): DrainResult {
  return {
    accepted: 0,
    rejected: 0,
    duplicated: 0,
    deferred: 0,
    failed: 0,
    sessionExpired: false,
    results: {},
  };
}

/** Exponential backoff gate: retry `attempts`-old rows only once due. */
function isDue(row: AttendanceQueueRow, now: number): boolean {
  if (row.attempts === 0) return true;
  const updated = Date.parse(row.updated_at);
  if (Number.isNaN(updated)) return true;
  return now - updated >= offlineBackoffMs(row.attempts);
}

function parseSubmission(row: AttendanceQueueRow): AttendanceSubmission | null {
  try {
    const parsed = JSON.parse(row.payload) as AttendanceSubmission;
    return parsed && parsed.eventId ? parsed : null;
  } catch {
    return null;
  }
}

async function applyServerResult(
  bridge: DeviceBridge,
  row: AttendanceQueueRow,
  event: AttendanceEventResult,
  result: DrainResult
): Promise<void> {
  result.results[row.id] = event;
  if (event.status === 'ACCEPTED' || event.status === 'DUPLICATE') {
    // DUPLICATE means the original IS recorded — resolve the row the same way.
    await markAccepted(bridge, row.id, { attendanceType: event.attendanceType });
    if (event.status === 'DUPLICATE') result.duplicated++;
    else result.accepted++;
  } else {
    await markRejected(bridge, row.id, event.rejectionReason ?? 'rejected');
    result.rejected++;
  }
}

/** Requeue without burning an attempt (session expiry / rate limit). */
async function requeueQuietly(bridge: DeviceBridge, rows: AttendanceQueueRow[], error: string, result: DrainResult): Promise<void> {
  for (const row of rows) {
    await markAttemptFailed(bridge, row.id, error, row.attempts);
    result.deferred++;
  }
}

/** Count a real attempt: requeue until the cap, then park as failed. */
async function countAttempt(bridge: DeviceBridge, rows: AttendanceQueueRow[], error: string, result: DrainResult): Promise<void> {
  for (const row of rows) {
    const status = await markAttemptFailed(bridge, row.id, error, row.attempts + 1);
    if (status === 'failed') result.failed++;
    else result.deferred++;
  }
}

/**
 * Classify a transport failure for the affected rows. Stops the drain on
 * session expiry / network loss / rate limiting so one failure never burns
 * the whole queue's attempt budget.
 */
async function handleFailure(
  bridge: DeviceBridge,
  rows: AttendanceQueueRow[],
  err: unknown,
  result: DrainResult
): Promise<'stop' | 'continue'> {
  if (!(err instanceof EssApiError)) {
    await countAttempt(bridge, rows, err instanceof Error ? err.message : String(err), result);
    return 'continue';
  }
  if (err.isSessionExpired) {
    // Not the events' fault: requeue without burning attempts.
    await requeueQuietly(bridge, rows, 'session expired', result);
    result.sessionExpired = true;
    return 'stop';
  }
  if (err.isNetwork) {
    await countAttempt(bridge, rows, 'network unavailable', result);
    return 'stop'; // offline — the remaining rows would all fail the same way
  }
  if (err.status === 429) {
    await requeueQuietly(bridge, rows, 'rate limited', result);
    return 'stop'; // back off globally; next trigger retries
  }
  if (err.status === 400 || err.status === 403 || err.status === 404) {
    // Definitive transport-level rejection — retrying cannot help.
    for (const row of rows) {
      await markAttemptFailed(bridge, row.id, err.message, ATTENDANCE_MAX_ATTEMPTS);
      result.failed++;
    }
    return 'continue';
  }
  await countAttempt(bridge, rows, err.message, result); // 5xx and friends
  return 'continue';
}

/**
 * Drain due queued rows once. A single row goes through the single-event
 * endpoint; batches use the sync endpoint with independent per-event results.
 */
export async function drainAttendanceQueue(
  bridge: DeviceBridge,
  api: EssAttendanceApi,
  options: { limit?: number } = {}
): Promise<DrainResult> {
  const result = emptyResult();

  // A crash mid-submit leaves rows in 'submitting' — idempotent replay is safe.
  await recoverStuckSubmitting(bridge);

  const now = Date.now();
  const claimed = await claimQueued(bridge, options.limit ?? 20);
  const due = claimed.filter((row) => isDue(row, now));
  result.deferred += claimed.length - due.length;

  const ready: Array<{ row: AttendanceQueueRow; submission: AttendanceSubmission }> = [];
  for (const row of due) {
    const submission = parseSubmission(row);
    if (!submission) {
      await markRejected(bridge, row.id, 'corrupt_payload');
      result.rejected++;
      continue;
    }
    ready.push({ row, submission });
  }
  if (ready.length === 0) return result;

  for (const { row } of ready) await markSubmitting(bridge, row.id);

  if (ready.length === 1) {
    const { row, submission } = ready[0];
    try {
      const event = await api.submitEvent(submission);
      await applyServerResult(bridge, row, event, result);
    } catch (err) {
      await handleFailure(bridge, [row], err, result);
    }
    return result;
  }

  try {
    const events = await api.syncEvents(ready.map((r) => r.submission));
    const byId = new Map(events.map((e) => [e.id, e]));
    for (const { row } of ready) {
      const event = byId.get(row.id);
      if (event) {
        await applyServerResult(bridge, row, event, result);
      } else {
        await markAttemptFailed(bridge, row.id, 'missing result in batch', row.attempts + 1);
        result.deferred++;
      }
    }
  } catch (err) {
    await handleFailure(
      bridge,
      ready.map((r) => r.row),
      err,
      result
    );
  }
  return result;
}
