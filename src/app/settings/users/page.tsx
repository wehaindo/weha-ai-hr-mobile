'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { hashPin, isValidPin, PIN_MAX_LENGTH } from '@/auth/crypto';
import { generateId } from '@/lib/id';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

interface UserRow {
  id: string;
  display_name: string;
  role: string;
  avatar_color: string | null;
  is_active: number;
  last_login_at: string | null;
}

interface RoleRow {
  id: string;
  name: string;
  is_system: number;
}

interface UserFormState {
  id?: string;
  displayName: string;
  role: string;
  pin: string;
  pinConfirm: string;
  active: boolean;
}

const EMPTY_FORM: UserFormState = { displayName: '', role: 'operator', pin: '', pinConfirm: '', active: true };

export default function UsersSettingsPage() {
  const bridge = useBridge();
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [form, setForm] = useState<UserFormState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [userRows, roleRows] = await Promise.all([
      bridge.db.query<UserRow>(
        'SELECT id, display_name, role, avatar_color, is_active, last_login_at FROM users ORDER BY display_name'
      ),
      bridge.db.query<RoleRow>('SELECT id, name, is_system FROM roles ORDER BY id'),
    ]);
    setUsers(userRows);
    setRoles(roleRows);
  }, [bridge]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveUser(): Promise<void> {
    if (!form) return;
    if (!form.displayName.trim()) {
      toast.add({ title: 'Name is required', type: 'error' });
      return;
    }
    if (!form.id) {
      if (!isValidPin(form.pin) || !isValidPin(form.pinConfirm)) {
        toast.add({ title: `PIN must be ${PIN_MAX_LENGTH} digits or fewer`, type: 'error' });
        return;
      }
      if (form.pin !== form.pinConfirm) {
        toast.add({ title: 'PINs do not match', type: 'error' });
        return;
      }
    } else if (form.pin && !isValidPin(form.pin)) {
      toast.add({ title: `PIN must be ${PIN_MAX_LENGTH} digits or fewer`, type: 'error' });
      return;
    }

    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (form.id) {
        await bridge.db.execute(
          'UPDATE users SET display_name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?',
          [form.displayName.trim(), form.role, form.active ? 1 : 0, now, form.id]
        );
        if (form.pin) {
          await bridge.db.execute('UPDATE users SET pin_hash = ? WHERE id = ?', [await hashPin(form.pin), form.id]);
        }
        toast.add({ title: 'User updated', type: 'success' });
      } else {
        await bridge.db.execute(
          `INSERT INTO users (id, display_name, pin_hash, role, avatar_color, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateId(),
            form.displayName.trim(),
            await hashPin(form.pin),
            form.role,
            'oklch(0.769 0.188 70.08)',
            form.active ? 1 : 0,
            now,
            now,
          ]
        );
        toast.add({ title: 'User created', type: 'success' });
      }
      setForm(null);
      await load();
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(user: UserRow): Promise<void> {
    if (user.id === currentUser?.id) {
      toast.add({ title: 'You cannot delete your own account', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await bridge.db.execute('DELETE FROM users WHERE id = ?', [user.id]);
      toast.add({ title: 'User deleted', type: 'success' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="users-settings">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>People who can sign in to this device</CardDescription>
          </div>
          <Button
            data-testid="add-user"
            onClick={() => setForm({ ...EMPTY_FORM, role: roles.find((r) => r.id !== 'admin')?.id ?? 'operator' })}
          >
            Add user
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid={`user-row-${user.display_name.toLowerCase().replace(/\s+/g, '-')}`}>
                  <TableCell className="font-medium">
                    {user.display_name}
                    {user.id === currentUser?.id && (
                      <Badge variant="outline" className="ml-2">
                        you
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="capitalize">{user.role}</TableCell>
                  <TableCell>
                    {user.is_active ? (
                      <Badge>active</Badge>
                    ) : (
                      <Badge variant="secondary">inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`edit-user-${user.id}`}
                        onClick={() =>
                          setForm({
                            id: user.id,
                            displayName: user.display_name,
                            role: user.role,
                            pin: '',
                            pinConfirm: '',
                            active: user.is_active === 1,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={user.id === currentUser?.id || busy}
                        onClick={() => void deleteUser(user)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>Permission groups</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <Badge key={role.id} variant="outline" className="px-3 py-1 capitalize">
              {role.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-sm" data-testid="user-form-dialog">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit user' : 'New user'}</DialogTitle>
            <DialogDescription>
              {form?.id ? 'Change name, role or PIN' : 'Digits used to sign in'}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Display name</Label>
                <Input
                  id="user-name"
                  data-testid="user-name-input"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value ?? form.role })}>
                  <SelectTrigger data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id} className="capitalize">
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="user-pin">{form.id ? 'New PIN (optional)' : 'PIN'}</Label>
                  <Input
                    id="user-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={PIN_MAX_LENGTH}
                    data-testid="user-pin-input"
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-pin-confirm">Confirm PIN</Label>
                  <Input
                    id="user-pin-confirm"
                    type="password"
                    inputMode="numeric"
                    maxLength={PIN_MAX_LENGTH}
                    data-testid="user-pin-confirm-input"
                    value={form.pinConfirm}
                    onChange={(e) => setForm({ ...form, pinConfirm: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>
              {form.id && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Active (can sign in)
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveUser()} data-testid="save-user">
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
