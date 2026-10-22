'use client';

import type { EssWidgetProps } from '@/lib/ess/widgets/registry';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Clearly-marked unavailable widget (BRD §4.1B): reserved for a future
 * service — shows no data at all, so nothing fabricated can be mistaken for
 * real information.
 */
export function UnavailableWidget({ title }: EssWidgetProps) {
  const copy: Record<string, string> = {
    Announcements: 'Company announcements will appear here once the announcement service is connected.',
    'Pending actions': 'Leave, attendance and approval actions will surface here in a later phase.',
  };

  return (
    <Card data-testid="widget-unavailable">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <Badge variant="outline">Not available yet</Badge>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {copy[title] ?? 'This module is reserved for a future phase.'}
      </CardContent>
    </Card>
  );
}
