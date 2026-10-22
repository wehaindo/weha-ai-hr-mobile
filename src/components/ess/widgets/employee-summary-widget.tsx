'use client';

import Link from 'next/link';
import type { EssWidgetProps } from '@/lib/ess/widgets/registry';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** BRD §4.1A — real data from the authorized profile (no fabricated values). */
export function EmployeeSummaryWidget({ title, profile }: EssWidgetProps) {
  if (profile.status === 'loading' || profile.status === 'idle') {
    return (
      <Card data-testid="widget-employee-summary">
        <CardHeader className="pb-2">
          <CardDescription>{title}</CardDescription>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (profile.status === 'no_session') {
    return (
      <Card data-testid="widget-employee-summary">
        <CardHeader className="pb-2">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-lg">Device account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sign in with a WEHA account to see your employment details.
        </CardContent>
      </Card>
    );
  }

  if (profile.status === 'error') {
    return (
      <Card data-testid="widget-employee-summary">
        <CardHeader className="pb-2">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-lg">Unavailable</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{profile.error.message}</span>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const emp = profile.employee;
  const fullName =
    emp.name?.trim() || [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || '—';
  const department = emp.department?.name ?? emp.departmentId ?? null;
  const company = emp.company?.name ?? emp.companyId ?? null;

  return (
    <Card data-testid="widget-employee-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          {emp.status && <Badge variant="secondary">{emp.status}</Badge>}
        </div>
        <CardTitle className="text-lg">{fullName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Employee number</span>
          <span className="font-mono">{emp.employeeNumber || '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Position</span>
          <span>{emp.position || '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Department</span>
          <span>{department || '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Company</span>
          <span>{company || '—'}</span>
        </div>
        <Link href="/profile">
          <Button variant="link" className="h-auto p-0 text-xs">
            Open full profile →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
