'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useBridge } from '@/platform';
import { useAuthStore } from '@/stores/auth';
import { loadEmployeeContext, type EssEmployeeContext } from '@/lib/ess/employee-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const bridge = useBridge();
  const user = useAuthStore((s) => s.user);
  const [context, setContext] = useState<EssEmployeeContext | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void loadEmployeeContext(bridge, user)
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, user]);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="profile-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Your employee identity on this device
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Identity</CardDescription>
          <CardTitle className="text-lg">{context?.displayName ?? user?.display_name ?? '…'}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row
            label="Account type"
            value={
              context?.authSource === 'mobile' ? (
                <Badge>WEHA account</Badge>
              ) : (
                <Badge variant="secondary">Device account</Badge>
              )
            }
          />
          <Row label="Email" value={context?.email ?? '—'} />
          <Row label="Employee ID" value={context?.employeeId ?? '—'} />
          <Row label="Tenant" value={context?.tenantId ?? '—'} />
          <Row label="Roles" value={context?.roles.join(', ') ?? '—'} />
          <Row
            label="Permissions"
            value={`${context?.permissions.length ?? 0} granted`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardDescription>Employment details</CardDescription>
            <Badge variant="secondary">Pending backend</Badge>
          </div>
          <CardTitle className="text-lg">Employee code / department</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Employee code" value={context?.employeeCode ?? '—'} />
          <Row label="Department" value={context?.departmentId ?? '—'} />
          <p className="pt-2 text-xs text-muted-foreground">
            Enrichment fields appear once the HR profile endpoint is connected (BRD §9.3).
          </p>
        </CardContent>
      </Card>

      {context?.authSource !== 'mobile' && (
        <p className="text-xs text-muted-foreground">
          This session uses a local device account. Sign in with a WEHA account to
          link your employee identity.
        </p>
      )}
    </div>
  );
}
