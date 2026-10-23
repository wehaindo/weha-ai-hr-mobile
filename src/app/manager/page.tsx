'use client';

// ESS Manager dashboard (BRD FR-601): counts + authorized team with today's
// attendance. Scope is server-computed — a non-manager sees an honest empty
// state; local accounts get the no-session card.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Search } from 'lucide-react';
import { useManagerDashboard } from '@/hooks/useManagerDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ManagerStats } from '@/components/ess/manager/manager-stats';
import { TeamList } from '@/components/ess/manager/team-list';

export default function ManagerPage() {
  const router = useRouter();
  const { state, search, setSearch, loadMore, reload } = useManagerDashboard();
  const [draft, setDraft] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounce server-side search (400ms after the last keystroke)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (draft !== search) setSearch(draft);
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [draft, search, setSearch]);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="manager-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Manager</h2>
          <p className="text-sm text-muted-foreground">
            Your team and the approvals waiting on you — scoped by the backend to your actual reports.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/approvals')} data-testid="manager-to-approvals">
          <Inbox className="mr-1.5 h-4 w-4" aria-hidden />
          Approval inbox
        </Button>
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
          </CardContent>
        </Card>
      ) : state.status === 'no_session' ? (
        <Card data-testid="manager-no-session">
          <CardHeader className="pb-2">
            <CardDescription>Manager</CardDescription>
            <CardTitle className="text-lg">No employee session on this device</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sign in with your WEHA account to see your team and approvals.
          </CardContent>
        </Card>
      ) : state.status === 'error' ? (
        <Card data-testid="manager-error">
          <CardHeader className="pb-2">
            <CardDescription>Manager</CardDescription>
            <CardTitle className="text-lg">Could not load the manager dashboard</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{state.error.message}</span>
            <Button variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (() => {
        const { dashboard, team, nextCursor } = state;
        const isManager = dashboard.teamCount > 0 || dashboard.pendingCount > 0;

        return (
          <>
            <ManagerStats
              teamCount={dashboard.teamCount}
              pendingCount={dashboard.pendingCount}
              completed30d={dashboard.completed30d}
              overdueCount={dashboard.overdueCount}
            />

            {!isManager ? (
              <Card data-testid="manager-empty">
                <CardHeader className="pb-2">
                  <CardDescription>Team</CardDescription>
                  <CardTitle className="text-lg">No team assigned to you</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Direct reports and delegated approval tasks appear here once your organizational
                  assignment is configured.
                </CardContent>
              </Card>
            ) : (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Team</h3>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <Input
                      aria-label="Search team"
                      placeholder="Search team…"
                      data-testid="team-search"
                      className="h-9 w-56 pl-8"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  </div>
                </div>

                <TeamList team={team} />

                {nextCursor && (
                  <Button variant="outline" size="sm" data-testid="team-load-more" onClick={loadMore}>
                    Load more
                  </Button>
                )}

                <p className="text-xs text-muted-foreground" data-testid="manager-note">
                  Attendance shown for today&apos;s work date; “Not yet calculated” means the payroll/attendance
                  engine has not produced a result yet.
                </p>
              </section>
            )}
          </>
        );
      })()}
    </div>
  );
}
