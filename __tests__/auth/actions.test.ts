// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { authenticate, authenticateWithCredentials, fetchActiveUsers, fetchPermissions } from '@/auth/actions';
import { hashPassword, hashPin, verifyPin } from '@/auth/crypto';
import { ALL_PERMISSIONS, mapRole } from '@/auth/permissions';

describe('auth actions', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('lists the seeded admin and demo users', async () => {
    const { bridge } = await createFakeBridge();
    const users = await fetchActiveUsers(bridge);
    expect(users).toHaveLength(2);
    expect(users[0].display_name).toBe('Administrator');
    expect(users[0].role).toBe('admin');
    expect(users.map((u) => u.display_name)).toContain('Demo User');
  });

  it('authenticates the seeded admin with PIN 1234 and returns full permissions', async () => {
    const { bridge } = await createFakeBridge();
    const [admin] = await fetchActiveUsers(bridge);

    const session = await authenticate(bridge, admin.id, '1234');
    expect(session.display_name).toBe('Administrator');
    expect(session.permissions).toEqual(expect.arrayContaining([...ALL_PERMISSIONS]));

    const rows = await bridge.db.query<{ last_login_at: string | null }>('SELECT last_login_at FROM users WHERE id = ?', [
      admin.id,
    ]);
    expect(rows[0].last_login_at).toBeTruthy();
  });

  it('rejects a wrong PIN', async () => {
    const { bridge } = await createFakeBridge();
    const [admin] = await fetchActiveUsers(bridge);
    await expect(authenticate(bridge, admin.id, '9999')).rejects.toThrow('Incorrect PIN');
  });

  it('deactivated users cannot authenticate', async () => {
    const { bridge } = await createFakeBridge();
    const [admin] = await fetchActiveUsers(bridge);
    await bridge.db.execute('UPDATE users SET is_active = 0 WHERE id = ?', [admin.id]);
    await expect(authenticate(bridge, admin.id, '1234')).rejects.toThrow();
  });

  it('fetchPermissions reads the role map', async () => {
    const { bridge } = await createFakeBridge();
    const perms = await fetchPermissions(bridge, 'operator');
    expect(perms).toEqual(['app.use', 'transactions.use']);
  });

  it('verifyPin works against the seeded bcrypt hash', async () => {
    const { bridge } = await createFakeBridge();
    const rows = await bridge.db.query<{ pin_hash: string }>('SELECT pin_hash FROM users LIMIT 1');
    expect(await verifyPin('1234', rows[0].pin_hash)).toBe(true);
    expect(await verifyPin('0000', rows[0].pin_hash)).toBe(false);
  });

  it('authenticates the seeded admin with username + password (admin/admin123)', async () => {
    const { bridge } = await createFakeBridge();
    const session = await authenticateWithCredentials(bridge, 'admin', 'admin123');
    expect(session.display_name).toBe('Administrator');
    expect(session.role).toBe('admin');
    expect(session.permissions).toEqual(expect.arrayContaining([...ALL_PERMISSIONS]));
  });

  it('rejects a wrong password and an unknown username', async () => {
    const { bridge } = await createFakeBridge();
    await expect(authenticateWithCredentials(bridge, 'admin', 'wrong')).rejects.toThrow('Incorrect password');
    await expect(authenticateWithCredentials(bridge, 'nobody', 'admin123')).rejects.toThrow('Unknown username');
  });

  it('errors for a user with no password set', async () => {
    const { bridge } = await createFakeBridge();
    const ts = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO users (id, display_name, username, pin_hash, role, is_active, created_at, updated_at)
       VALUES ('u-nopass', 'No Pass', 'nopass', 'x', 'operator', 1, ?, ?)`,
      [ts, ts]
    );
    await expect(authenticateWithCredentials(bridge, 'nopass', 'any')).rejects.toThrow('No password set for this user');
  });

  it('authenticateWithCredentials rejects a deactivated user', async () => {
    const { bridge } = await createFakeBridge();
    await bridge.db.execute("UPDATE users SET is_active = 0 WHERE username = 'admin'");
    await expect(authenticateWithCredentials(bridge, 'admin', 'admin')).rejects.toThrow('Unknown username');
  });

  it('hashPassword produces a bcrypt hash verifiable by authenticateWithCredentials', async () => {
    const { bridge } = await createFakeBridge();
    const ts = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO users (id, display_name, username, pin_hash, password_hash, role, is_active, created_at, updated_at)
       VALUES ('u-bob', 'Bob', 'bob', 'x', ?, 'operator', 1, ?, ?)`,
      [await hashPassword('secret123'), ts, ts]
    );
    const session = await authenticateWithCredentials(bridge, 'bob', 'secret123');
    expect(session.display_name).toBe('Bob');
  });
});

describe('synced identity login (employees / portal_users)', () => {
  it('maps synced free-text roles to built-in roles', () => {
    expect(mapRole('Administrator')).toBe('admin');
    expect(mapRole('admin')).toBe('admin');
    expect(mapRole('Manager')).toBe('manager');
    expect(mapRole('Cashier')).toBe('operator'); // unmatched → least privilege
    expect(mapRole(null)).toBe('operator');
    expect(mapRole('')).toBe('operator');
  });

  it('lists synced employees that have a device PIN', async () => {
    const { bridge } = await createFakeBridge();
    const ts = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO employees (id, name, role, is_active, device_pin_hash, created_at, updated_at)
       VALUES ('emp-1', 'Budi', 'Cashier', 1, ?, ?, ?)`,
      [await hashPin('1234'), ts, ts]
    );

    const users = await fetchActiveUsers(bridge);
    const budi = users.find((u) => u.display_name === 'Budi');
    expect(budi).toBeDefined();
    expect(budi?.role).toBe('operator'); // Cashier → operator
  });

  it('authenticates a synced employee with their device PIN (offline)', async () => {
    const { bridge } = await createFakeBridge();
    const ts = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO employees (id, name, role, is_active, device_pin_hash, created_at, updated_at)
       VALUES ('emp-1', 'Admin Staff', 'Administrator', 1, ?, ?, ?)`,
      [await hashPin('5678'), ts, ts]
    );

    const session = await authenticate(bridge, 'emp-1', '5678');
    expect(session.display_name).toBe('Admin Staff');
    expect(session.role).toBe('admin'); // Administrator → admin
    expect(session.permissions).toEqual(expect.arrayContaining([...ALL_PERMISSIONS]));

    await expect(authenticate(bridge, 'emp-1', '0000')).rejects.toThrow('Incorrect PIN');
  });

  it('authenticates a synced portal user with their password (offline)', async () => {
    const { bridge } = await createFakeBridge();
    const ts = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO employees (id, name, role, is_active, created_at, updated_at)
       VALUES ('emp-2', 'Manager Person', 'Manager', 1, ?, ?)`,
      [ts, ts]
    );
    await bridge.db.execute(
      `INSERT INTO portal_users (id, email, name, employee_id, is_active, password_hash, created_at, updated_at)
       VALUES ('pu-1', 'budi@example.com', 'Budi', 'emp-2', 1, ?, ?, ?)`,
      [await hashPassword('secret123'), ts, ts]
    );

    const session = await authenticateWithCredentials(bridge, 'budi@example.com', 'secret123');
    expect(session.display_name).toBe('Budi');
    expect(session.role).toBe('manager'); // linked employee Manager → manager

    await expect(authenticateWithCredentials(bridge, 'budi@example.com', 'wrong')).rejects.toThrow('Incorrect password');
    await expect(authenticateWithCredentials(bridge, 'nobody@example.com', 'x')).rejects.toThrow('Unknown username');
  });

  it('a portal user without a linked employee defaults to operator', async () => {
    const { bridge } = await createFakeBridge();
    const ts = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO portal_users (id, email, name, employee_id, is_active, password_hash, created_at, updated_at)
       VALUES ('pu-2', 'solo@example.com', 'Solo', NULL, 1, ?, ?, ?)`,
      [await hashPassword('pw'), ts, ts]
    );
    const session = await authenticateWithCredentials(bridge, 'solo@example.com', 'pw');
    expect(session.role).toBe('operator');
  });

  it('matches portal emails case-insensitively', async () => {
    const { bridge } = await createFakeBridge();
    const ts = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO portal_users (id, email, name, employee_id, is_active, password_hash, created_at, updated_at)
       VALUES ('pu-3', 'Casey@Example.com', 'Casey', NULL, 1, ?, ?, ?)`,
      [await hashPassword('pw'), ts, ts]
    );
    // stored with mixed case, typed lowercase → still matches
    const session = await authenticateWithCredentials(bridge, 'casey@example.com', 'pw');
    expect(session.display_name).toBe('Casey');
  });
});
