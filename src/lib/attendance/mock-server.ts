// SIMULATED server round-trip for the attendance sample — there is no real
// attendance backend in the framework. This fake drives the exact phases the
// UI shows (sending → processing → result) with configurable latency and a
// failure rate, so the multi-phase flow is always demonstrable offline.
//
// To use a REAL endpoint later, replace the body of sendPunchSimulated with a
// bridge.cloud.request() POST (base URL from deviceConfig.erp.baseUrl, Bearer
// from integrations.device_token — see src/integration/push/register.ts). The
// signature and onPhase contract stay the same, so callers don't change.

import type { AttendanceAction, PunchPhase } from './status';

export interface PunchPayload {
  id: string;
  user_id: string;
  action: AttendanceAction;
  /** ISO-8601 UTC. */
  recorded_at: string;
}

export interface PunchResult {
  ok: true;
  /** Server-assigned reference for this punch. */
  serverRef: string;
}

export interface SendOptions {
  /** Probability [0..1] the simulated server rejects the punch. Default 0.2. */
  failRate?: number;
  /** Simulated client→server latency (ms). Default 500. */
  sendingMs?: number;
  /** Simulated server processing time (ms). Default 1200. */
  processingMs?: number;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Simulate sending a punch to the server, surfacing progress through `onPhase`.
 * Resolves with a server reference on success; throws on simulated rejection.
 */
export async function sendPunchSimulated(
  punch: PunchPayload,
  onPhase: (phase: PunchPhase) => void,
  opts: SendOptions = {}
): Promise<PunchResult> {
  const { failRate = 0.2, sendingMs = 500, processingMs = 1200 } = opts;

  // Client → server transit.
  onPhase('sending');
  await wait(safeDelay(sendingMs));

  // Server-side processing.
  onPhase('processing');
  await wait(safeDelay(processingMs));

  // Server verdict.
  if (Math.random() < failRate) {
    throw new Error('Server rejected the punch');
  }

  return { ok: true, serverRef: refFor(punch) };
}

/** Deterministic-looking reference, e.g. "ATT-20260101-8f3a". */
function refFor(punch: PunchPayload): string {
  const ymd = punch.recorded_at.slice(0, 10).replace(/-/g, '');
  return `ATT-${ymd}-${punch.id.slice(-4)}`;
}

/** Guard against negative/NaN delays (keeps timers sane under fake clocks). */
function safeDelay(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}
