// Data Hub sync worker — polls the hub for events per entity cursor, applies
// them locally, and acks applied event_ids. Ported from ai-pos to run against
// the DeviceBridge. Push/pull entity types come from the hub-entities registry.

import type { DeviceBridge } from '@/platform';
import { DatahubClient, type SyncEvent, type PullResult } from './client';
import { applyEvent } from './apply';
import { listHubEntityTypes } from '../hub-entities';

const POLL_INTERVAL_MS = 30_000;
const MAX_EVENTS_PER_PULL = 200;

// Columns stripped from local rows before pushing to the hub.
const HUB_STRIP_COLUMNS = new Set(['version', 'updated_at', 'created_at']);

async function fetchLocalData(bridge: DeviceBridge, entityType: string): Promise<Record<string, unknown>[]> {
  try {
    const rows = await bridge.db.query<Record<string, unknown>>(`SELECT * FROM ${entityType}`);
    return rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const [col, value] of Object.entries(row)) {
        if (!HUB_STRIP_COLUMNS.has(col)) obj[col] = value;
      }
      return obj;
    });
  } catch {
    return [];
  }
}

export interface SyncWorkerStatus {
  running: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  totalPulled: number;
  totalApplied: number;
  totalErrors: number;
}

type StatusListener = (status: SyncWorkerStatus) => void;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class DatahubSyncWorker {
  private client: DatahubClient | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private status: SyncWorkerStatus = {
    running: false,
    lastPollAt: null,
    lastError: null,
    totalPulled: 0,
    totalApplied: 0,
    totalErrors: 0,
  };
  private listeners = new Set<StatusListener>();

  constructor(private bridge: DeviceBridge) {}

  getStatus(): SyncWorkerStatus {
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

  private async getCursor(entityType: string): Promise<number> {
    const rows = await this.bridge.db.query<{ last_cursor: number }>(
      'SELECT last_cursor FROM datahub_sync_state WHERE entity_type = ?',
      [entityType]
    );
    return rows[0]?.last_cursor ?? 0;
  }

  private async setCursor(entityType: string, cursor: number): Promise<void> {
    await this.bridge.db.execute(
      `INSERT INTO datahub_sync_state (entity_type, last_cursor, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(entity_type) DO UPDATE SET last_cursor = excluded.last_cursor, updated_at = excluded.updated_at`,
      [entityType, cursor, new Date().toISOString()]
    );
  }

  async start(endpoint: string, deviceToken: string, fetchImpl?: FetchLike): Promise<void> {
    if (this.running) return;
    this.client = new DatahubClient(endpoint, deviceToken, fetchImpl);
    this.running = true;
    this.status.running = true;
    this.notify();
    void this.poll();
    this.intervalId = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.status.running = false;
    this.notify();
  }

  private async poll(): Promise<void> {
    if (!this.client) return;
    this.status.lastPollAt = new Date().toISOString();

    try {
      for (const entityType of listHubEntityTypes()) {
        const cursor = await this.getCursor(entityType);
        const result = await this.client.pull(cursor, entityType, MAX_EVENTS_PER_PULL);

        if (result.events.length > 0) {
          await this.processEvents(result);
          await this.setCursor(entityType, result.cursor);
          this.status.totalPulled += result.events.length;
        }
      }
      this.status.lastError = null;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
    }

    this.notify();
  }

  private async processEvents(result: PullResult): Promise<void> {
    const ackedIds: string[] = [];
    const errors: string[] = [];

    for (const event of result.events) {
      try {
        const applyResult = await applyEvent(this.bridge, event);
        if (applyResult.status === 'applied') {
          ackedIds.push(event.event_id);
          this.status.totalApplied++;
        } else if (applyResult.status === 'error') {
          errors.push(`${event.entity_type}:${event.entity_id} ${applyResult.error}`);
          this.status.totalErrors++;
        }
      } catch (error) {
        errors.push(`${event.entity_type}:${event.entity_id} ${error instanceof Error ? error.message : String(error)}`);
        this.status.totalErrors++;
      }
    }

    if (ackedIds.length > 0) {
      try {
        await this.client!.ack(ackedIds);
      } catch (error) {
        errors.push(`ACK failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (errors.length > 0) {
      this.status.lastError = errors.join('; ');
    }
  }

  /** One-shot push-all-then-pull sync. */
  async syncNow(
    endpoint: string,
    deviceToken: string,
    role?: string,
    publishableEntities?: string[] | null,
    fetchImpl?: FetchLike
  ): Promise<{ pulled: number; applied: number; pushed: number; errors: string[] }> {
    const client = new DatahubClient(endpoint, deviceToken, fetchImpl);
    let totalPulled = 0;
    let totalApplied = 0;
    let totalPushed = 0;
    const errors: string[] = [];
    const isMaster = role === 'master_pos';
    const allTypes = listHubEntityTypes();

    // Phase 1: push local data (master: all; slave: only allowed; kiosk: none).
    if (isMaster || (role !== 'kiosk' && publishableEntities && publishableEntities.length > 0)) {
      const pushable = isMaster ? allTypes : allTypes.filter((e) => publishableEntities!.includes(e));

      for (const entityType of pushable) {
        try {
          const rows = await fetchLocalData(this.bridge, entityType);
          if (rows.length === 0) continue;

          const events = rows.map((row) => ({
            entity_type: entityType,
            entity_id: String(row.id),
            action: 'create' as const,
            version: 1,
            payload: row,
          }));

          const pushResult = await client.push(events);
          if (pushResult.ok && pushResult.results) {
            totalPushed += pushResult.results.filter((r) => r.status === 'applied').length;
          }
        } catch (error) {
          errors.push(`push ${entityType}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Phase 2: pull events (all roles).
    for (const entityType of allTypes) {
      try {
        const cursor = await this.getCursor(entityType);
        const result = await client.pull(cursor, entityType, MAX_EVENTS_PER_PULL);

        if (result.events.length > 0) {
          totalPulled += result.events.length;
          const ackedIds: string[] = [];

          for (const event of result.events as SyncEvent[]) {
            const applyResult = await applyEvent(this.bridge, event);
            if (applyResult.status === 'applied') {
              ackedIds.push(event.event_id);
              totalApplied++;
            } else if (applyResult.status === 'error') {
              errors.push(`${event.entity_type}:${event.entity_id} ${applyResult.error}`);
            }
          }

          if (ackedIds.length > 0) {
            await client.ack(ackedIds);
          }
          await this.setCursor(entityType, result.cursor);
        }
      } catch (error) {
        errors.push(`${entityType}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { pulled: totalPulled, applied: totalApplied, pushed: totalPushed, errors };
  }
}

// ---- Config CRUD service over datahub_configs ----

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface DatahubConfigRow {
  id: string;
  name: string;
  endpoint: string;
  device_id: string | null;
  device_token: string | null;
  enabled: number;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export class DatahubService {
  constructor(private bridge: DeviceBridge) {}

  async getConfig(): Promise<DatahubConfigRow | null> {
    const rows = await this.bridge.db.query<DatahubConfigRow>('SELECT * FROM datahub_configs ORDER BY created_at ASC LIMIT 1');
    return rows[0] ?? null;
  }

  async saveConfig(input: { endpoint: string; device_token?: string; enabled?: boolean }): Promise<DatahubConfigRow> {
    const existing = await this.getConfig();
    const timestamp = new Date().toISOString();

    if (existing) {
      await this.bridge.db.execute(
        'UPDATE datahub_configs SET endpoint = ?, device_token = ?, enabled = ?, updated_at = ? WHERE id = ?',
        [input.endpoint, input.device_token ?? existing.device_token, input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0, timestamp, existing.id]
      );
      return (await this.getConfig())!;
    }

    const id = randomHex(16);
    await this.bridge.db.execute(
      `INSERT INTO datahub_configs (id, name, endpoint, device_token, enabled, created_at, updated_at) VALUES (?, 'Data Hub', ?, ?, ?, ?, ?)`,
      [id, input.endpoint, input.device_token ?? null, input.enabled ? 1 : 0, timestamp, timestamp]
    );
    return (await this.getConfig())!;
  }
}
