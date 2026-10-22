'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Clearly-marked placeholder surface (BRD §10.2): any sample values inside are
 * labeled MOCK and must never be mistaken for real employee data.
 */
export function EssPlaceholder({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <Card data-testid="ess-placeholder">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <Badge variant="secondary">MOCK · Phase 2</Badge>
        </div>
        {subtitle && <CardTitle className="text-lg">{subtitle}</CardTitle>}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}
