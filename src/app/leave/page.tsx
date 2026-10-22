'use client';

import { EssPlaceholder } from '@/components/ess/ess-placeholder';

const BALANCES = [
  { label: 'Annual leave', used: 6, total: 12 },
  { label: 'Sick leave', used: 1, total: 10 },
  { label: 'Unpaid leave', used: 0, total: 0 },
];

export default function LeavePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="leave-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Leave</h2>
        <p className="text-sm text-muted-foreground">
          Balances and leave requests — backend integration lands in Phase 2
        </p>
      </div>

      <EssPlaceholder title="Balances" subtitle="Sample balances (not synced)">
        <div className="grid gap-3 sm:grid-cols-3">
          {BALANCES.map((b) => (
            <div key={b.label} className="rounded-lg border p-3 text-sm">
              <p className="text-muted-foreground">{b.label}</p>
              <p className="font-semibold">
                {b.total > 0 ? `${b.total - b.used} of ${b.total} days left` : '—'}
              </p>
            </div>
          ))}
        </div>
      </EssPlaceholder>

      <EssPlaceholder title="Requests" subtitle="No leave requests yet">
        <p className="text-sm text-muted-foreground">
          Submitting and tracking leave will use the HR backend API.
        </p>
      </EssPlaceholder>
    </div>
  );
}
