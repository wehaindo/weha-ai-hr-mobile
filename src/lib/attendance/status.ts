// Attendance status derivation — pure, no bridge/React imports so it can be
// unit-tested directly. Each record is one event; the current state comes from
// the most recent event (newest-first ordering is the caller's responsibility).

export type AttendanceAction = 'CHECK_IN' | 'CHECK_OUT';

export interface AttendanceEvent {
  id: string;
  action: AttendanceAction;
  /** ISO-8601 UTC timestamp of the event. */
  recorded_at: string;
  user_name?: string | null;
}

export type AttendanceStatus = 'in' | 'out';

/**
 * Derive the current status from events sorted newest-first.
 * No events (or the latest is a check-out) → 'out'; latest is a check-in → 'in'.
 */
export function computeStatus(events: AttendanceEvent[]): AttendanceStatus {
  return events[0]?.action === 'CHECK_IN' ? 'in' : 'out';
}

/** The most recent event, if any. */
export function lastEvent(events: AttendanceEvent[]): AttendanceEvent | undefined {
  return events[0];
}

// ---------------------------------------------------------------------------
// Punch flow (multi-phase: send → server processing → result)
// ---------------------------------------------------------------------------

/** Lifecycle of a single punch as it travels to the server. */
export type PunchPhase = 'idle' | 'sending' | 'processing' | 'synced' | 'failed';

export const PUNCH_PHASES: PunchPhase[] = ['idle', 'sending', 'processing', 'synced', 'failed'];

/** Label + badge styling for each phase (Record idiom, like RealtimeStatus). */
export const PHASE_META: Record<PunchPhase, { label: string; className: string }> = {
  idle: { label: 'Ready', className: 'bg-muted text-muted-foreground' },
  sending: { label: 'Sending…', className: 'bg-amber-100 text-amber-800' },
  processing: { label: 'Server processing…', className: 'bg-blue-100 text-blue-800' },
  synced: { label: 'Synced', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
};

/** How long a terminal phase (synced/failed) holds before returning to idle. */
export const TERMINAL_HOLD_MS = 2500;

/** A terminal phase holds on screen, then the flow settles back to idle. */
export function isTerminalPhase(phase: PunchPhase): boolean {
  return phase === 'synced' || phase === 'failed';
}
