// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendPunchSimulated, type PunchPayload } from '@/lib/attendance/mock-server';
import { PUNCH_PHASES, PHASE_META, type PunchPhase } from '@/lib/attendance/status';

const PUNCH: PunchPayload = {
  id: 'abcdef1234567890',
  user_id: 'u1',
  action: 'CHECK_IN',
  recorded_at: '2026-01-01T09:00:00.000Z',
};

describe('sendPunchSimulated', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Run the promise while advancing fake timers until it settles. */
  async function run(promise: Promise<unknown>): Promise<{ ok: boolean; value?: unknown; error?: unknown }> {
    const settled = { ok: false, value: undefined, error: undefined } as {
      ok: boolean;
      value?: unknown;
      error?: unknown;
    };
    promise.then(
      (v) => {
        settled.ok = true;
        settled.value = v;
      },
      (e) => {
        settled.ok = false;
        settled.error = e;
      }
    );
    // Advance past sending (500) + processing (1200) with headroom.
    await vi.advanceTimersByTimeAsync(5000);
    return settled;
  }

  it('surfaces sending then processing, in order', async () => {
    const phases: PunchPhase[] = [];
    const promise = sendPunchSimulated(PUNCH, (p) => phases.push(p), { failRate: 0 });
    await vi.advanceTimersByTimeAsync(5000);

    expect(phases).toEqual(['sending', 'processing']);
    await promise;
  });

  it('resolves with a serverRef when it succeeds', async () => {
    const result = await run(sendPunchSimulated(PUNCH, () => {}, { failRate: 0 }));

    expect(result.ok).toBe(true);
    const value = result.value as { ok: true; serverRef: string };
    expect(value.ok).toBe(true);
    expect(value.serverRef).toMatch(/^ATT-\d{8}-/);
  });

  it('throws when failRate is 1 (always rejects)', async () => {
    const result = await run(sendPunchSimulated(PUNCH, () => {}, { failRate: 1 }));

    expect(result.ok).toBe(false);
    expect((result.error as Error).message).toMatch(/rejected/i);
  });

  it('never throws when failRate is 0', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await run(sendPunchSimulated(PUNCH, () => {}, { failRate: 0 }));
      expect(result.ok).toBe(true);
    }
  });

  it('uses the injected latencies (completes after sending + processing)', async () => {
    const phases: PunchPhase[] = [];
    const promise = sendPunchSimulated(PUNCH, (p) => phases.push(p), {
      failRate: 0,
      sendingMs: 100,
      processingMs: 100,
    });

    // onPhase('sending') fires synchronously, before the first await.
    expect(phases).toEqual(['sending']);
    // Still within the sending window (100ms) — no second phase yet.
    await vi.advanceTimersByTimeAsync(50);
    expect(phases).toEqual(['sending']);
    // Past sending → processing begins.
    await vi.advanceTimersByTimeAsync(100);
    expect(phases).toEqual(['sending', 'processing']);
    // Past processing → resolves.
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toMatchObject({ ok: true });
  });
});

describe('PHASE_META', () => {
  it('defines a label and className for every phase', () => {
    for (const phase of PUNCH_PHASES) {
      expect(PHASE_META[phase]).toBeDefined();
      expect(PHASE_META[phase].label.length).toBeGreaterThan(0);
      expect(PHASE_META[phase].className.length).toBeGreaterThan(0);
    }
  });
});
