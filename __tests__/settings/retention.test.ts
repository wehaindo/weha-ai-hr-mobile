// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { RetentionService, RETENTION_TABLES } from '@/lib/retention/service';

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

describe('RetentionService', () => {
  let handle: FakeBridgeHandle;
  let service: RetentionService;

  beforeEach(async () => {
    handle = await createFakeBridge();
    service = new RetentionService(handle.bridge);
    // Seed one old + one recent audit_log row (id is INTEGER AUTOINCREMENT).
    await handle.bridge.db.execute('INSERT INTO audit_log (id, action, created_at) VALUES (?, ?, ?)', [1, 'old', daysAgo(200)]);
    await handle.bridge.db.execute('INSERT INTO audit_log (id, action, created_at) VALUES (?, ?, ?)', [2, 'new', daysAgo(1)]);
  });

  it('has a config entry for every prunable table', async () => {
    const config = await service.getConfig();
    expect(config.enabled).toBe(false);
    for (const t of RETENTION_TABLES) {
      expect(config.days[t.table]).toBeTypeOf('number');
    }
  });

  it('saves and reloads config (engine reads same keys)', async () => {
    const config = await service.getConfig();
    config.enabled = true;
    config.days.audit_log = 100;
    await service.saveConfig(config);

    const reloaded = await service.getConfig();
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.days.audit_log).toBe(100);
  });

  it('previews only rows older than the retention age', async () => {
    const config = await service.getConfig();
    config.days.audit_log = 90;
    const preview = await service.purgePreview(config);
    const audit = preview.find((p) => p.table === 'audit_log');
    expect(audit?.count).toBe(1); // only the 200-day-old row
  });

  it('cleanup deletes only old rows, keeps recent', async () => {
    const config = await service.getConfig();
    config.days.audit_log = 90;
    await service.runCleanup(config);

    const remaining = await handle.bridge.db.query<{ id: number }>('SELECT id FROM audit_log');
    expect(remaining.map((r) => r.id)).toContain(2); // recent row
    expect(remaining.map((r) => r.id)).not.toContain(1); // old row deleted
  });

  it('writes an audit_log entry when rows were deleted', async () => {
    const config = await service.getConfig();
    config.days.audit_log = 90;
    await service.runCleanup(config);

    const audits = await handle.bridge.db.query<{ action: string }>("SELECT action FROM audit_log WHERE action = 'retention.cleanup'");
    expect(audits.length).toBe(1);
  });

  it('purge deletes all rows regardless of age', async () => {
    const result = await service.runPurge();
    const auditPurge = result.find((r) => r.table === 'audit_log');
    expect(auditPurge?.deleted).toBe(2);
    const remaining = await handle.bridge.db.query('SELECT id FROM audit_log');
    expect(remaining).toHaveLength(0);
  });
});
