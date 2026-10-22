// Shared exponential backoff for offline queues (print, attendance, …).
// Attempts are 1-based: first retry waits BASE, doubling up to MAX.

export const OFFLINE_RETRY_BASE_MS = 10_000;
export const OFFLINE_RETRY_MAX_MS = 300_000;

export function offlineBackoffMs(attempts: number): number {
  return Math.min(OFFLINE_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)), OFFLINE_RETRY_MAX_MS);
}
