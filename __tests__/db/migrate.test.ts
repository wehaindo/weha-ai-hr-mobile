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
      'print_queue',
      'hardware_devices',
      'hardware_templates',
      'hardware_logs',
      'integration_entities',
      'integration_field_maps',
      'datahub_configs',
      'datahub_sync_state',
      'datahub_entity_map',
      'ecr_logs',
      'google_accounts',
      'google_sheet_configs',
      'google_sheet_column_maps',
      'google_sync_jobs',
      'google_sync_logs',
      'grist_configs',
      'grist_column_maps',
      'grist_sync_jobs',
      'grist_sync_logs',
      'supabase_configs',
      'supabase_column_maps',
      'supabase_sync_jobs',
      'supabase_sync_logs',
      'ai_configs',
      'ai_voice_logs',
      'product_aliases',
      'test_products',
      'test_orders',
      'test_order_lines',
      'test_lookups',
      'sample_transactions',
      'sample_transaction_lines',
      'attendance_queue',
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it('accepts payment_terminal device type after the ECR migration', async () => {
    const db = await freshEngine();
    runMigrations(db, frameworkMigrations);

    const now = new Date().toISOString();
    db.execute(
      `INSERT INTO hardware_devices (id, uuid, name, type, connection_type, connection_config, capabilities, status, is_default, is_active, created_at, updated_at)
       VALUES ('t1', 'u1', 'Terminal', 'payment_terminal', 'network', ?, '{}', 'offline', 0, 1, ?, ?)`,
      [JSON.stringify({ bank: 'bca', ip: '10.0.0.9', port: 53535 }), now, now]
    );
    const rows = db.query<{ type: string }>("SELECT type FROM hardware_devices WHERE id = 't1'");
    expect(rows[0].type).toBe('payment_terminal');
  });

  it('grants hardware.manage to admin and manager roles', async () => {
    const db = await freshEngine();
    runMigrations(db, frameworkMigrations);

    for (const roleId of ['admin', 'manager']) {
      const rows = db.query<{ c: number }>(
        "SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = ? AND permission_id = 'hardware.manage'",
        [roleId]
      );
      expect(rows[0].c).toBe(1);
    }

    // Operator must not have it.
    const op = db.query<{ c: number }>(
      "SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = 'operator' AND permission_id = 'hardware.manage'"
    );
    expect(op[0].c).toBe(0);
  });

  it('grants transactions.use to admin, manager and operator roles', async () => {
    const db = await freshEngine();
    runMigrations(db, frameworkMigrations);

    for (const roleId of ['admin', 'manager', 'operator']) {
      const rows = db.query<{ c: number }>(
        "SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = ? AND permission_id = 'transactions.use'",
        [roleId]
      );
      expect(rows[0].c).toBe(1);
    }
  });

  it('inserts and cascades sample transactions', async () => {
    const db = await freshEngine();
    runMigrations(db, frameworkMigrations);

    const now = new Date().toISOString();
    db.execute(
      `INSERT INTO sample_transactions (id, reference, status, customer_name, total, notes, created_by, created_at, updated_at)
       VALUES ('tx1', 'TX-1', 'COMPLETED', NULL, 2500, NULL, 'u1', ?, ?)`,
      [now, now]
    );
    db.execute(
      `INSERT INTO sample_transaction_lines (id, transaction_id, description, quantity, unit_price, line_total, created_at, updated_at)
       VALUES ('line1', 'tx1', 'Item', 2, 1250, 2500, ?, ?)`,
      [now, now]
    );
    expect(db.query<{ c: number }>('SELECT COUNT(*) AS c FROM sample_transaction_lines')[0].c).toBe(1);

    db.execute("DELETE FROM sample_transactions WHERE id = 'tx1'");
    expect(db.query<{ c: number }>('SELECT COUNT(*) AS c FROM sample_transaction_lines')[0].c).toBe(0);
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
