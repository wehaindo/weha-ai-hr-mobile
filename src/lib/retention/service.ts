// Retention service — age-based pruning of the framework's OWN append-only log
// tables. Config lives in device_settings KV (`retention.*`) and the engine reads
// the SAME keys the settings UI writes (fixing ai-pos's UI↔engine config bug).
// Only framework-owned tables are pruned — never domain tables a device app owns.

import type { DeviceBridge } from '@/platform';

/** A prunable framework table: timestamp column + default retention days. */
export interface RetentionTable {
  table: string;
  column: string;
  defaultDays: number;
}

/** Framework-owned append-only tables safe to prune by age. */
export const RETENTION_TABLES: RetentionTable[] = [
  { table: 'audit_log', column: 'created_at', defaultDays: 90 },
  { table: 'sync_log', column: 'created_at', defaultDays: 90 },
  { table: 'hardware_logs', column: 'created_at', defaultDays: 90 },
  { table: 'ecr_logs', column: 'created_at', defaultDays: 90 },
  { table: 'print_queue', column: 'created_at', defaultDays: 30 },
  { table: 'ai_voice_logs', column: 'created_at', defaultDays: 90 },
  { table: 'google_sync_jobs', column: 'created_at', defaultDays: 90 },
  { table: 'google_sync_logs', column: 'created_at', defaultDays: 90 },
  { table: 'grist_sync_jobs', column: 'created_at', defaultDays: 90 },
  { table: 'grist_sync_logs', column: 'created_at', defaultDays: 90 },
  { table: 'supabase_sync_jobs', column: 'created_at', defaultDays: 90 },
  { table: 'supabase_sync_logs', column: 'created_at', defaultDays: 90 },
  { table: 'datahub_sync_state', column: 'updated_at', defaultDays: 365 },
];

export interface RetentionConfig {
  enabled: boolean;
  /** Per-table retention in days (keyed by table name). */
  days: Record<string, number>;
}

function now(): string {
  return new Date().toISOString();
}

/** Cutoff timestamp (ISO) for a given age in days. */
function cutoffFor(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export class RetentionService {
  constructor(private bridge: DeviceBridge) {}

  /** Load retention config from KV (`retention.enabled`, `retention.days.<table>`). */
  async getConfig(): Promise<RetentionConfig> {
    const enabled = (await this.bridge.kv.get<boolean>('retention.enabled')) ?? false;
    const days: Record<string, number> = {};
    for (const t of RETENTION_TABLES) {
      const stored = await this.bridge.kv.get<number>(`retention.days.${t.table}`);
      days[t.table] = typeof stored === 'number' ? stored : t.defaultDays;
    }
    return { enabled, days };
  }

  /** Save retention config to KV (same keys the engine reads). */
  async saveConfig(config: RetentionConfig): Promise<void> {
    await this.bridge.kv.set('retention.enabled', config.enabled);
    for (const [table, daysValue] of Object.entries(config.days)) {
      await this.bridge.kv.set(`retention.days.${table}`, daysValue);
    }
  }

  /** Count rows older than the configured age per table (preview before cleanup). */
  async purgePreview(config: RetentionConfig): Promise<Array<{ table: string; count: number; days: number }>> {
    const out: Array<{ table: string; count: number; days: number }> = [];
    for (const t of RETENTION_TABLES) {
      const days = config.days[t.table] ?? t.defaultDays;
      if (days <= 0) continue;
      try {
        const rows = await this.bridge.db.query<{ c: number }>(
          `SELECT COUNT(*) AS c FROM "${t.table}" WHERE "${t.column}" < ?`,
          [cutoffFor(days)]
        );
        out.push({ table: t.table, count: rows[0]?.c ?? 0, days });
      } catch {
        /* table may not exist in a trimmed build */
      }
    }
    return out;
  }

  /**
   * Delete rows older than the configured age. Returns per-table deleted counts.
   * Appends an audit_log entry summarizing the run.
   */
  async runCleanup(config: RetentionConfig): Promise<Array<{ table: string; deleted: number; days: number }>> {
    const out: Array<{ table: string; deleted: number; days: number }> = [];
    let totalDeleted = 0;

    for (const t of RETENTION_TABLES) {
      const days = config.days[t.table] ?? t.defaultDays;
      if (days <= 0) continue;
      try {
        const cutoff = cutoffFor(days);
        const before = await this.bridge.db.query<{ c: number }>(
          `SELECT COUNT(*) AS c FROM "${t.table}" WHERE "${t.column}" < ?`,
          [cutoff]
        );
        const count = before[0]?.c ?? 0;
        if (count > 0) {
          await this.bridge.db.execute(`DELETE FROM "${t.table}" WHERE "${t.column}" < ?`, [cutoff]);
          totalDeleted += count;
        }
        out.push({ table: t.table, deleted: count, days });
      } catch {
        /* table may not exist */
      }
    }

    // Audit the run (append-only; not pruned in the same pass). audit_log.id is
    // INTEGER AUTOINCREMENT, so omit it and let SQLite assign.
    if (totalDeleted > 0) {
      await this.bridge.db.execute('INSERT INTO audit_log (action, entity_type, detail, created_at) VALUES (?, ?, ?, ?)', [
        'retention.cleanup',
        'system',
        JSON.stringify(out),
        now(),
      ]);
    }

    return out;
  }

  /** Hard-delete ALL rows from prunable tables regardless of age (dangerous). */
  async runPurge(): Promise<Array<{ table: string; deleted: number }>> {
    const out: Array<{ table: string; deleted: number }> = [];
    for (const t of RETENTION_TABLES) {
      try {
        const before = await this.bridge.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${t.table}"`);
        const count = before[0]?.c ?? 0;
        if (count > 0) {
          await this.bridge.db.execute(`DELETE FROM "${t.table}"`);
          out.push({ table: t.table, deleted: count });
        }
      } catch {
        /* table may not exist */
      }
    }
    return out;
  }
}
