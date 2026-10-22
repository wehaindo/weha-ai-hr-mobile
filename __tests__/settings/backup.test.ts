// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeBridge, type FakeBridgeHandle } from '../helpers/fake-bridge';
import { exportJson, importJson, clearAll, type BackupSnapshot } from '@/lib/backup/service';

describe('BackupService', () => {
  let handle: FakeBridgeHandle;

  beforeEach(async () => {
    handle = await createFakeBridge();
  });

  it('exports all tables to a snapshot', async () => {
    const json = await exportJson(handle.bridge);
    const snapshot = JSON.parse(json) as BackupSnapshot;
    expect(snapshot.format).toBe('weha-backup');
    expect(snapshot.tables.users).toBeDefined();
    expect(snapshot.tables.device_settings).toBeDefined();
  });

  it('round-trips data through export → import', async () => {
    // Seed a row.
    const now = new Date().toISOString();
    await handle.bridge.db.execute(
      `INSERT INTO device_settings (key, value, updated_at) VALUES ('test.key', '"hello"', ?)`,
      [now]
    );

    const json = await exportJson(handle.bridge);

    // Wipe the row, then restore.
    await handle.bridge.db.execute("DELETE FROM device_settings WHERE key = 'test.key'");
    expect((await handle.bridge.db.query('SELECT key FROM device_settings WHERE key = ?', ['test.key']))).toHaveLength(0);

    await importJson(handle.bridge, json);
    const restored = await handle.bridge.db.query<{ value: string }>('SELECT value FROM device_settings WHERE key = ?', ['test.key']);
    expect(restored).toHaveLength(1);
    expect(JSON.parse(restored[0].value)).toBe('hello');
  });

  it('rejects invalid JSON / non-backup payloads', async () => {
    await expect(importJson(handle.bridge, 'not json')).rejects.toThrow('Invalid backup file');
    await expect(importJson(handle.bridge, '{"format":"wrong"}')).rejects.toThrow('Not a valid weha backup');
  });

  it('clearAll truncates everything except users + _migrations', async () => {
    const now = new Date().toISOString();
    await handle.bridge.db.execute(`INSERT INTO device_settings (key, value, updated_at) VALUES ('k', 'v', ?)`, [now]);
    await handle.bridge.db.execute(
      `INSERT INTO hardware_logs (id, device_id, action, status, created_at) VALUES ('h1', NULL, 'test', 'success', ?)`,
      [now]
    );

    const usersBefore = await handle.bridge.db.query('SELECT id FROM users');
    const cleared = await clearAll(handle.bridge);

    const usersAfter = await handle.bridge.db.query('SELECT id FROM users');
    expect(usersAfter).toHaveLength(usersBefore.length);
    expect(cleared).not.toContain('users');
    expect(cleared).not.toContain('_migrations');
    expect(cleared).toContain('device_settings');
    expect(cleared).toContain('hardware_logs');

    const settings = await handle.bridge.db.query('SELECT key FROM device_settings');
    expect(settings).toHaveLength(0);
  });
});
