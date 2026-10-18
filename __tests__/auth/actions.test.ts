// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { authenticate, authenticateWithCredentials, fetchActiveUsers, fetchPermissions } from '@/auth/actions';
import { hashPassword, verifyPin } from '@/auth/crypto';
import { ALL_PERMISSIONS } from '@/auth/permissions';

describe('auth actions', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('lists the seeded admin user', async () => {
    const { bridge } = await createFakeBridge();
    const users = await fetchActiveUsers(bridge);
    expect(users).toHaveLength(1);
    expect(users[0].display_name).toBe('Administrator');
    expect(users[0].role).toBe('admin');
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
    expect(perms).toEqual(['app.use']);
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
