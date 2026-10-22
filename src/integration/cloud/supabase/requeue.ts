// Supabase requeue helpers — ported from ai-pos. `retryDelaySeconds` is the
// exponential-backoff math (30s · 2^n capped at 15min); the shared worker uses
// a flat requeue delay, but this is exported for callers that want per-job backoff.

export const RETRY_BASE_SECONDS = 30;
export const RETRY_MAX_SECONDS = 900; // 15 minutes

/** Exponential backoff for a retry attempt (1-based). */
export function retryDelaySeconds(attempt: number): number {
  const n = Math.max(0, attempt - 1);
  return Math.min(RETRY_BASE_SECONDS * Math.pow(2, n), RETRY_MAX_SECONDS);
}

/** ISO timestamp `delay` seconds from now. */
export function nextAttemptAt(attempt: number, from: Date = new Date()): string {
  return new Date(from.getTime() + retryDelaySeconds(attempt) * 1000).toISOString();
}
