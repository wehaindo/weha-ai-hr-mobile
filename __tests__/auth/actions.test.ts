// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from '../helpers/fake-bridge';
import { authenticate, fetchActiveUsers, fetchPermissions } from '@/auth/actions';
import { verifyPin } from '@/auth/crypto';
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
});
