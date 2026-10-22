'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';
import type { EssWidgetProps } from '@/lib/ess/widgets/registry';
import { listEssServices } from '@/lib/ess/widgets/services';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/** BRD §4.1C — permission-aware shortcuts; `coming` tiles are never linked. */
export function ServiceShortcutsWidget({ title }: EssWidgetProps) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const services = listEssServices(permissions);

  return (
    <Card data-testid="widget-service-shortcuts">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-lg">ESS services</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            const tile = (
              <div
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-center text-xs ${
                  service.status === 'available'
                    ? 'bg-card hover:border-primary/50 hover:bg-accent'
                    : 'opacity-70'
                }`}
                data-testid={`service-${service.id}`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="font-medium">{service.label}</span>
                {service.status === 'coming' && (
                  <Badge variant="secondary" className="text-[10px]">
                    Coming later
                  </Badge>
                )}
              </div>
            );

            return service.status === 'available' && service.href ? (
              <Link key={service.id} href={service.href} aria-label={service.label}>
                {tile}
              </Link>
            ) : (
              <div key={service.id} aria-disabled="true">
                {tile}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
