// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEngine, type DatabaseEngine } from '@/db/engine';
import { MemoryBlobStore } from '@/db/persistence';
import { runMigrations } from '@/db/migrate';
import { frameworkMigrations } from '@/db/migrations';
import { generateId } from '@/lib/id';

async function freshEngine(): Promise<DatabaseEngine> {
  return createEngine(new MemoryBlobStore());
}

describe('runMigrations', () => {
  it('applies framework migrations exactly once', async () => {
    const db = await freshEngine();

    const first = runMigrations(db, frameworkMigrations);
    expect(first.applied).toEqual(frameworkMigrations.map((m) => m.id).sort());

    const second = runMigrations(db, frameworkMigrations);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied.length).toBe(frameworkMigrations.length);
  });

  it('creates the core tables', async () => {
    const db = await freshEngine();
    runMigrations(db, frameworkMigrations);

    const tables = db
      .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((r) => r.name);

    for (const expected of [
      '_migrations',
      'users',
      'device_settings',
      'integrations',
      'sync_queue',
      'sync_definitions',
      'sync_log',
      'audit_log',
      'roles',
      'role_permissions',
      'printer_profiles',
      'print_queue',
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it('seeds the admin user with permissions and default settings', async () => {
    const db = await freshEngine();
    runMigrations(db, frameworkMigrations);

    const admin = db.query<{ role: string; is_active: number; pin_hash: string }>(
      "SELECT role, is_active, pin_hash FROM users WHERE role = 'admin'"
    );
    expect(admin).toHaveLength(1);
    expect(admin[0].is_active).toBe(1);
    expect(admin[0].pin_hash).toMatch(/^\$2/); // bcrypt

    const adminPerms = db.query<{ permission_id: string }>(
      "SELECT permission_id FROM role_permissions WHERE role_id = 'admin' ORDER BY permission_id"
    );
    expect(adminPerms.length).toBeGreaterThanOrEqual(5);

    const activated = db.query<{ value: string }>("SELECT value FROM device_settings WHERE key = 'device.activated'");
    expect(activated[0].value).toBe('false');
  });

  it('applies new migrations added later', async () => {
    const db = await freshEngine();
    runMigrations(db, frameworkMigrations);

    const extra = {
      id: '0005_extra',
      up: (database: DatabaseEngine) => {
        database.execute('CREATE TABLE extra (id TEXT PRIMARY KEY)');
      },
    };
    const result = runMigrations(db, [...frameworkMigrations, extra]);
    expect(result.applied).toEqual(['0005_extra']);
  });

  it('generateId produces unique 16-char hex ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});
