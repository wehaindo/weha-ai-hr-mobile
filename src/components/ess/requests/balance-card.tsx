'use client';

// Leave balance card (BRD §4.1): server values only, "available" leads.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EssLeaveBalance } from '@/integration/ess/requests';

export function BalanceCard({ balance }: { balance: EssLeaveBalance }) {
  return (
    <Card data-testid="balance-card" data-code={balance.code}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium">{balance.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <p className="text-2xl font-bold tracking-tight" data-testid="balance-available">
          {balance.available}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{balance.unit ?? 'days'} available</span>
        </p>
        <p className="text-xs text-muted-foreground" data-testid="balance-detail">
          {balance.used} used of {balance.entitled}
          {balance.pending > 0 ? ` · ${balance.pending} pending` : ''}
        </p>
      </CardContent>
    </Card>
  );
}
