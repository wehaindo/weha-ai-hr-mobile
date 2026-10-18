// Generic cloud-sync worker — the shared poll → send → requeue loop for cloud
// orderline destinations (Google/Supabase/Grist). Each destination supplies an
// adapter that knows its config/job tables, how to send a batch, and how to
// build the payload for a row. Ported from ai-pos's three near-identical
// workers into one parameterized core.

import type { DeviceBridge } from '@/platform';
import { chunkArray } from './shared';

const POLL_INTERVAL_MS = 10_000;
const REQUEUE_DELAY_SECONDS = 30;

export interface CloudSyncStatus {
  running: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  sent: number;
  failed: number;
}

type StatusListener = (status: CloudSyncStatus) => void;

/** A destination-specific hook set supplied to the worker. */
export interface CloudAdapter {
  /** Config table (e.g. supabase_configs). */
  configTable: string;
  /** Job table (e.g. supabase_sync_jobs). */
  jobTable: string;
  /** Log table (e.g. supabase_sync_logs). */
  logTable: string;
  /** Destination column-name field on column maps (e.g. supabase_column). */
  columnField: string;
  /** Column-map table for this destination. */
  columnMapTable: string;
  /** Table the payload is uploaded to (Supabase: 'pos_orderlines'; may be dynamic). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveTable?(config: Record<string, any>): string;
  /** Send a batch of mapped payloads. Return per-job results (index-aligned). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendBatch(config: Record<string, any>, batch: Array<{ id: string; payload: Record<string, any>; syncId: string }>): Promise<Array<{ ok: boolean; error?: string; recordId?: string }>>;
}

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

export class CloudSyncWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private status: CloudSyncStatus = { running: false, lastPollAt: null, lastError: null, sent: 0, failed: 0 };
  private listeners = new Set<StatusListener>();

  constructor(private bridge: DeviceBridge, private adapter: CloudAdapter) {}

  getStatus(): CloudSyncStatus {
    return { ...this.status };
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = { ...this.status };
    this.listeners.forEach((l) => l(snapshot));
  }

  start(): void {
    if (this.timer) return;
    this.status.running = true;
    this.notify();
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.status.running = false;
    this.notify();
  }

  /** Re-release `retry` jobs older than the delay back to `pending`; promote exhausted ones to `failed`. */
  private async requeue(): Promise<void> {
    const cutoff = new Date(Date.now() - REQUEUE_DELAY_SECONDS * 1000).toISOString();
    await this.bridge.db.execute(
      `UPDATE ${this.adapter.jobTable} SET status = 'pending', updated_at = ? WHERE status = 'retry' AND updated_at <= ? AND attempt_count < max_attempts`,
      [now(), cutoff]
    );
    await this.bridge.db.execute(
      `UPDATE ${this.adapter.jobTable} SET status = 'failed', updated_at = ? WHERE status = 'retry' AND attempt_count >= max_attempts`,
      [now()]
    );
  }

  private async loadActiveConfig(): Promise<Record<string, unknown> | null> {
    const rows = await this.bridge.db.query<Record<string, unknown>>(
      `SELECT * FROM ${this.adapter.configTable} WHERE is_active = 1 AND sync_mode != 'manual' LIMIT 1`
    );
    return rows[0] ?? null;
  }

  private async log(configId: string | null, status: 'success' | 'error' | 'warning', message: string, records = 0): Promise<void> {
    await this.bridge.db.execute(
      `INSERT INTO ${this.adapter.logTable} (id, config_id, action, status, records_synced, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomHex(16), configId, 'sync', status, records, message, now()]
    );
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.status.lastPollAt = now();

    try {
      await this.requeue();
      const config = await this.loadActiveConfig();
      if (!config) {
        this.status.lastError = null;
        this.notify();
        return;
      }

      const batchSize = Number(config.batch_size ?? 100) || 100;
      const jobs = await this.bridge.db.query<{ id: string; sync_id: string; payload: string }>(
        `SELECT id, sync_id, payload FROM ${this.adapter.jobTable} WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
        [batchSize * 2]
      );

      if (jobs.length === 0) {
        this.status.lastError = null;
        this.notify();
        return;
      }

      const batches = chunkArray(jobs, batchSize);
      for (const batch of batches) {
        await this.processBatch(config, batch);
      }

      this.status.lastError = null;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.running = false;
      this.notify();
    }
  }

  private async processBatch(config: Record<string, unknown>, batch: Array<{ id: string; sync_id: string; payload: string }>): Promise<void> {
    // Mark processing + increment attempts.
    const ids = batch.map((j) => j.id);
    const placeholders = ids.map(() => '?').join(', ');
    await this.bridge.db.execute(
      `UPDATE ${this.adapter.jobTable} SET status = 'processing', attempt_count = attempt_count + 1, updated_at = ? WHERE id IN (${placeholders})`,
      [now(), ...ids]
    );

    const items = batch.map((j) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let payload: Record<string, any> = {};
      try {
        payload = JSON.parse(j.payload);
      } catch {
        payload = {};
      }
      return { id: j.id, payload, syncId: j.sync_id };
    });

    let results: Array<{ ok: boolean; error?: string; recordId?: string }>;
    try {
      results = await this.adapter.sendBatch(config, items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markBatch(batch, 'retry', message);
      this.status.failed += batch.length;
      return;
    }

    let sent = 0;
    for (let i = 0; i < batch.length; i++) {
      const result = results[i] ?? { ok: false, error: 'No result' };
      if (result.ok) {
        await this.bridge.db.execute(
          `UPDATE ${this.adapter.jobTable} SET status = 'success', last_error = NULL, processed_at = ?, updated_at = ? WHERE id = ?`,
          [now(), now(), batch[i].id]
        );
        sent++;
      } else {
        const row = await this.bridge.db.query<{ attempt_count: number; max_attempts: number }>(
          `SELECT attempt_count, max_attempts FROM ${this.adapter.jobTable} WHERE id = ?`,
          [batch[i].id]
        );
        const attempts = row[0]?.attempt_count ?? 1;
        const max = row[0]?.max_attempts ?? 5;
        const terminal = attempts >= max;
        await this.bridge.db.execute(
          `UPDATE ${this.adapter.jobTable} SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
          [terminal ? 'failed' : 'retry', result.error ?? 'Send failed', now(), batch[i].id]
        );
        this.status.failed++;
      }
    }

    this.status.sent += sent;
    if (sent > 0 || this.status.failed > 0) {
      const status = this.status.failed > 0 ? 'warning' : 'success';
      await this.log((config.id as string) ?? null, status, `sent ${sent}`, sent);
      await this.bridge.db.execute(`UPDATE ${this.adapter.configTable} SET last_sync_at = ?, updated_at = ? WHERE id = ?`, [
        now(),
        now(),
        config.id,
      ]);
    }
  }

  private async markBatch(batch: Array<{ id: string }>, status: 'retry' | 'failed', error: string): Promise<void> {
    for (const job of batch) {
      const row = await this.bridge.db.query<{ attempt_count: number; max_attempts: number }>(
        `SELECT attempt_count, max_attempts FROM ${this.adapter.jobTable} WHERE id = ?`,
        [job.id]
      );
      const attempts = row[0]?.attempt_count ?? 1;
      const max = row[0]?.max_attempts ?? 5;
      const finalStatus = status === 'retry' && attempts >= max ? 'failed' : status;
      await this.bridge.db.execute(
        `UPDATE ${this.adapter.jobTable} SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
        [finalStatus, error, now(), job.id]
      );
    }
  }
}
