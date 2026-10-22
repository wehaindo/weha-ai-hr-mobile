'use client';

import { useState } from 'react';
import { useEssProfile } from '@/hooks/useEssProfile';
import {
  buildProfilePatch,
  profileFormFrom,
  toProfileSections,
  validateProfileForm,
  type ProfileFieldErrors,
  type ProfileForm,
} from '@/lib/ess/profile';
import { EssApiError } from '@/integration/ess/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';

function SectionRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="divide-y">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-1.5 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="break-all text-right font-medium">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const { state, reload, update } = useEssProfile();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form || state.status !== 'ready') return;
    const validation = validateProfileForm(form);
    setErrors(validation);
    if (validation.email || validation.phone) return;

    const patch = buildProfilePatch(form, state.employee);
    if (Object.keys(patch).length === 0) {
      setForm(null);
      toast.add({ title: 'No changes to save', type: 'info' });
      return;
    }

    setBusy(true);
    try {
      await update(patch);
      setForm(null);
      toast.add({ title: 'Profile updated', description: 'Your changes were saved.', type: 'success' });
    } catch (err) {
      if (err instanceof EssApiError && err.code === 'conflict') {
        setErrors({ email: err.message });
      } else {
        toast.add({
          title: 'Update failed',
          description: err instanceof Error ? err.message : 'Please try again.',
          type: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="profile-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground">Your authorized employee record</p>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ) : state.status === 'no_session' ? (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Employee record</CardDescription>
            <CardTitle className="text-lg">No employee linked</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This session uses a local device account. Sign in with a WEHA account to view
            your employee profile.
          </CardContent>
        </Card>
      ) : state.status === 'error' ? (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Employee record</CardDescription>
            <CardTitle className="text-lg">Could not load your profile</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{state.error.message}</span>
            <Button variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (() => {
        const emp = state.employee;
        const sections = toProfileSections(emp);
        const fullName =
          emp.name?.trim() || [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || '—';

        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{fullName}</h3>
                <p className="text-sm text-muted-foreground">
                  {emp.position || 'Employee'} · {emp.employeeNumber || 'no employee number'}
                </p>
              </div>
              {emp.status && <Badge variant="secondary">{emp.status}</Badge>}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Personal identity</CardDescription>
                <CardTitle className="text-lg">Identity</CardTitle>
              </CardHeader>
              <CardContent>
                <SectionRows rows={sections.identity} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Organization and employment</CardDescription>
                <CardTitle className="text-lg">Employment</CardTitle>
              </CardHeader>
              <CardContent>
                <SectionRows rows={sections.organization} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardDescription>Contact information</CardDescription>
                  {!form && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setErrors({});
                        setForm(profileFormFrom(emp));
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                <CardTitle className="text-lg">Contact</CardTitle>
              </CardHeader>
              <CardContent>
                {form ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="profile-email">Personal email</Label>
                      <Input
                        id="profile-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        aria-invalid={!!errors.email}
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="profile-phone">Phone number</Label>
                      <Input
                        id="profile-phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        aria-invalid={!!errors.phone}
                      />
                      {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Only email and phone can be edited here. Name, employee number,
                      company, department, position and status are read-only — changes go
                      through HR. Updates are recorded in the audit log.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={save} disabled={busy}>
                        {busy ? 'Saving…' : 'Save changes'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setForm(null);
                          setErrors({});
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <SectionRows rows={sections.contact} />
                )}
              </CardContent>
            </Card>
          </>
        );
      })()}
    </div>
  );
}
