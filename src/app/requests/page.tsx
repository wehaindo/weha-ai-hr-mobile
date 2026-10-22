'use client';

import { EssPlaceholder } from '@/components/ess/ess-placeholder';

export default function RequestsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="requests-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Requests</h2>
        <p className="text-sm text-muted-foreground">
          General HR requests and approvals — backend integration lands in Phase 2
        </p>
      </div>

      <EssPlaceholder title="Pending requests" subtitle="Nothing pending (sample)">
        <p className="text-sm text-muted-foreground">
          Travel, documents and other requests will appear here with their approval status.
        </p>
      </EssPlaceholder>

      <EssPlaceholder title="History" subtitle="No closed requests yet">
        <p className="text-sm text-muted-foreground">
          Completed requests will be listed with their decisions.
        </p>
      </EssPlaceholder>
    </div>
  );
}
